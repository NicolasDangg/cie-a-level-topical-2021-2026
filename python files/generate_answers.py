#!/usr/bin/env python3
"""Build answer HTML from the locally preserved official mark-scheme PDFs."""
from __future__ import annotations

import html
import json
import re
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path

import pdfplumber

ROOT = Path("/Users/nicolasdangg/Documents/past paper/cie-a-level-topical-2021-2026")
SUBJECTS = {
    "9702": {"name": "Physics"},
    "9618": {"name": "Computer Science"},
}

def css():
    return """<style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 10.5pt/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; }
h1 { font-size: 20pt; margin: 0 0 4mm; } h2 { font-size: 14pt; margin: 0 0 2mm; }
header { border-bottom: 1.5pt solid #17202a; padding-bottom: 4mm; margin-bottom: 6mm; }
.meta, .note { color: #4b5563; font-size: 9pt; } .question { padding-bottom: 2mm; }
.question[id] { scroll-margin-top: 12mm; }
.question + .question { page-break-before: always; break-before: page; }
.question-head { display: flex; justify-content: space-between; gap: 4mm; border-bottom: .5pt solid #9ca3af; padding-bottom: 2mm; margin-bottom: 4mm; page-break-after: avoid; break-after: avoid-page; }
.question-head + .answer-text { page-break-before: avoid; break-before: avoid-page; }
.answer-images { margin: 0 0 5mm; }
.answer-image { display: block; max-width: 100%; max-height: 245mm; width: auto; height: auto; margin: 0 auto 4mm; border: .35pt solid #d1d5db; page-break-inside: avoid; break-inside: avoid; }
.answer-text { white-space: pre-wrap; font: 9pt/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; border: .5pt solid #d1d5db; padding: 4mm; overflow-wrap: anywhere; }
@media screen { body { max-width: 190mm; margin: 12mm auto; } .question { margin-bottom: 12mm; } }
</style>"""

def page_markers(text, question_count):
    markers = []
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = re.match(
            r"^\s*(\d{1,2})\s*(?=\([a-z]|Defining|Methods?|Additional detail)",
            line,
        )
        if m and 1 <= int(m.group(1)) <= question_count:
            markers.append((i, int(m.group(1))))
    return markers

def extract_sections(pdf_path, question_count):
    """Return official text sections and PDF page numbers for each printed question."""
    by_question = defaultdict(list)
    current = None
    with pdfplumber.open(pdf_path) as doc:
        for page_no, page in enumerate(doc.pages, 1):
            text = page.extract_text() or ""
            if "Question Answer Marks" not in text:
                continue
            lines = text.splitlines()
            markers = page_markers(text, question_count)
            if not markers:
                if current is not None and text.strip():
                    by_question[current].append((page_no, text.strip()))
                continue
            filtered = []
            page_current = current
            for marker in markers:
                question = marker[1]
                if page_current is None and question != 1:
                    continue
                if page_current is not None and (question < page_current or question > page_current + 1):
                    continue
                filtered.append(marker)
                page_current = question
            if not filtered:
                if current is not None and text.strip():
                    by_question[current].append((page_no, text.strip()))
                continue
            for index, (line_no, question) in enumerate(filtered):
                end = filtered[index + 1][0] if index + 1 < len(filtered) else len(lines)
                section = "\n".join(lines[line_no:end]).strip()
                if section:
                    by_question[question].append((page_no, section))
                current = question
    return {
        q: {
            "source_pages": sorted({page for page, _ in parts}),
            "text": "\n\n".join(text for _, text in parts).strip(),
        }
        for q, parts in by_question.items()
    }

def ms_path(subject_dir, record):
    qp = subject_dir / record["local_pdf"]
    return qp.parent.parent / "ms" / qp.name.replace("_qp_", "_ms_")

def ms_url(record):
    return record["source_pdf"].replace("_qp_", "_ms_")

def render_page(pdf_path, page_no, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.is_file() and output_path.stat().st_size > 0:
        return
    pdftoppm = shutil.which("pdftoppm")
    if not pdftoppm:
        raise RuntimeError("pdftoppm is required to render official mark-scheme pages")
    prefix = output_path.with_suffix("")
    subprocess.run(
        [pdftoppm, "-png", "-r", "150", "-f", str(page_no), "-l", str(page_no), "-singlefile", str(pdf_path), str(prefix)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    rendered = prefix.with_suffix(".png")
    if rendered != output_path:
        rendered.replace(output_path)

def answer_image_paths(subject_dir, entry, path):
    if entry["status"] != "available":
        return []
    asset_dir = subject_dir / "answer-assets"
    paths = []
    for page_no in entry["source_pages"]:
        filename = f"{path.stem}-p{page_no:02d}.png"
        output = asset_dir / filename
        render_page(path, page_no, output)
        paths.append(f"../answer-assets/{filename}")
    return paths

def write_html(subject, topic_slug, topic_label, entries):
    topic_dir = ROOT / subject / topic_slug
    topic_dir.mkdir(parents=True, exist_ok=True)
    out = [
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
        f"<title>{subject} {html.escape(topic_label)} — answers</title>",
        css(), "</head><body>",
        f"<header><h1>{html.escape(topic_label)}</h1><div class='meta'>{subject} {html.escape(SUBJECTS[subject]['name'])} · official mark-scheme answers · {len(entries)} questions</div></header>",
    ]
    if not entries:
        out.append("<p class='note'>No answer entries are currently classified in this topic.</p>")
    for entry in entries:
        out.append(f"<article class='question' id='{html.escape(entry['id'], quote=True)}'>")
        marks = f" · {entry['marks']} marks" if entry.get("marks") is not None else ""
        out.append(f"<div class='question-head'><h2>{html.escape(entry['id'])}</h2><div class='meta'>{html.escape(entry['session'])} {entry['year']} · Paper {entry['variant']} · Question {entry['question_number']}{marks}</div></div>")
        if entry["status"] == "available":
            if entry.get("image_paths"):
                out.append("<div class='answer-images'>")
                for image_path in entry["image_paths"]:
                    out.append(f"<img class='answer-image' src='{html.escape(image_path)}' alt='{html.escape(entry['id'])} official mark scheme page'>")
                out.append("</div>")
            out.append(f"<div class='answer-text'>{html.escape(entry['text'])}</div>")
            out.append(f"<p class='note'>Official mark scheme pages: {', '.join(map(str, entry['source_pages']))} · <a href='{html.escape(entry['source_pdf_url'])}'>source PDF URL</a></p>")
        else:
            out.append(f"<p class='note'>Official mark scheme unavailable after fallback search: {html.escape(entry['reason'])}</p>")
        out.append("</article>")
    out.append("</body></html>")
    (topic_dir / "answers.html").write_text("\n".join(out), encoding="utf-8")

def build_subject(subject):
    subject_dir = ROOT / subject
    manifest_path = subject_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    groups = defaultdict(list)
    sections_cache = {}
    answer_records = []
    available_ms = 0
    unavailable_ms = 0
    for record in manifest["records"]:
        path = ms_path(subject_dir, record)
        qcount = next(p["question_count"] for p in manifest["papers"] if p["year"] == record["year"] and p["session_code"] == record["session_code"] and p["variant"] == record["variant"])
        if path.is_file():
            key = str(path)
            if key not in sections_cache:
                sections_cache[key] = extract_sections(path, qcount)
            section = sections_cache[key].get(record["question_number"], {})
            source_pages = section.get("source_pages", [])
            text = section.get("text", "")
            if source_pages and text:
                status, reason = "available", None
                available_ms += 1
            else:
                status, reason = "unavailable", "No question section was extractable from the preserved official mark scheme"
                unavailable_ms += 1
        else:
            status, reason, source_pages, text = "unavailable", "No official mark scheme PDF was available after fallback searches", [], ""
            unavailable_ms += 1
        entry = {
            "id": record["id"], "question_id": record["id"], "subject": subject,
            "year": record["year"], "session": record["session"], "session_code": record["session_code"],
            "paper": record["paper"], "variant": record["variant"], "question_number": record["question_number"],
            "topic": record["topic"], "topic_slug": record["topic_slug"], "marks": record["marks"],
            "status": status, "reason": reason, "text": text, "source_pages": source_pages,
            "source_pdf": str(path.relative_to(subject_dir)) if path.is_file() else None,
            "source_pdf_url": ms_url(record), "html": f"{record['topic_slug']}/answers.html",
        }
        entry["image_paths"] = answer_image_paths(subject_dir, entry, path) if path.is_file() else []
        groups[record["topic_slug"]].append(entry)
        answer_records.append(entry)
        record["answer"] = {
            "status": status, "id": record["id"], "html": f"{record['topic_slug']}/answers.html",
            "source_pdf": entry["source_pdf"], "source_pdf_url": entry["source_pdf_url"],
            "source_pages": source_pages, "marks": record["marks"], "image_paths": entry["image_paths"],
        }
    for topic in manifest["topics"]:
        entries = sorted(groups.get(topic["slug"], []), key=lambda x: (x["year"], x["session_code"], x["variant"], x["question_number"]))
        write_html(subject, topic["slug"], topic["label"], entries)
    answer_manifest = {
        "schema": "cie-topical-past-papers/answers-v1",
        "subject": subject,
        "subject_name": SUBJECTS[subject]["name"],
        "generated": "2026-08-14",
        "coverage": {
            "question_records": len(answer_records),
            "available_mark_scheme_entries": available_ms,
            "unavailable_mark_scheme_entries": unavailable_ms,
        },
        "records": answer_records,
    }
    (subject_dir / "answers-manifest.json").write_text(json.dumps(answer_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"subject": subject, "answers": len(answer_records), "available": available_ms, "unavailable": unavailable_ms, "mark_scheme_pdfs": len(sections_cache)}

if __name__ == "__main__":
    print(json.dumps([build_subject("9702"), build_subject("9618")], indent=2))
