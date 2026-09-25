#!/usr/bin/env python3
"""Build answer page crops and answers-manifest.json from the preserved official mark-scheme PDFs."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path

import pdfplumber

import export_data

ROOT = Path(__file__).resolve().parent.parent
SUBJECTS = {
    "9702": {"name": "Physics"},
    "9618": {"name": "Computer Science"},
    "9990": {"name": "Psychology"},
}

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

def build_subject(subject):
    subject_dir = ROOT / subject
    manifest_path = subject_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
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
        answer_records.append(entry)
        record["answer"] = {
            "status": status, "id": record["id"], "html": f"{record['topic_slug']}/answers.html",
            "source_pdf": entry["source_pdf"], "source_pdf_url": entry["source_pdf_url"],
            "source_pages": source_pages, "marks": record["marks"], "image_paths": entry["image_paths"],
        }
    answer_manifest = {
        "schema": "cie-topical-past-papers/answers-v1",
        "subject": subject,
        "subject_name": SUBJECTS[subject]["name"],
        "generated": "2026-09-24",
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
    print(json.dumps([build_subject("9702"), build_subject("9618"), build_subject("9990")], indent=2))
    export_data.main()
