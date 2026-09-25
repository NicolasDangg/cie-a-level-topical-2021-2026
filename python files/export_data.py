#!/usr/bin/env python3
"""Export the app's content JSON from the existing manifests.

Reads each subject's manifest.json and answers-manifest.json and writes
content/{subject}/index.json and content/{subject}/topics/{slug}.json.
Never opens a PDF or renders an image: image paths are the existing PNG
files, rewritten as site-root URLs (e.g. /9618/<topic>/assets/<file>.png).
Duplicate detection reads the existing PNG pixels (Pillow).
"""
from __future__ import annotations

import json
import posixpath
import re
import shutil
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
SCHEMA = "topicalpaper-content/v2"
SUBJECTS = ("9702", "9618", "9990")


def question_sort_key(record):
    # Same order as the generated questions.html pages.
    return (record["year"], record["session_code"], record["variant"], record["question_number"])


# Crops of the same question in two variants differ only in the clipped
# footer line (its paper code): the bottom few pixel rows.
FOOTER_ROWS = 12
EXCERPT_LIMIT = 3000  # generate_question_assets.py truncates text_excerpt here


def _normalise_text(text):
    text = re.sub(r"\d{4}/\d{2}/[A-Z/]+/\d{2}", "", text)  # paper code, e.g. 9702/42/O/N/23
    text = re.sub(r"©\s*UCLES\s*\d{4}", "", text)
    text = text.replace("[Turn over", "")
    return re.sub(r"\s+", " ", text).strip()


def _text_usable(record):
    # 2024-25 papers use subset fonts; their text comes out as "(cid:123)" codes.
    text = record.get("text_excerpt", "")
    return bool(text) and text.count("(cid:") < 5 and len(text) < EXCERPT_LIMIT


def _crops_match(subject_dir, a, b):
    if len(a["image_paths"]) != len(b["image_paths"]) or not a["image_paths"]:
        return False
    for pa, pb in zip(a["image_paths"], b["image_paths"]):
        with Image.open(subject_dir / pa) as ia, Image.open(subject_dir / pb) as ib:
            if ia.size != ib.size:
                return False
            diff = ImageChops.difference(ia.convert("L"), ib.convert("L")).point(lambda v: 255 if v > 40 else 0)
            box = diff.getbbox()
            if box and box[1] < ia.height - FOOTER_ROWS:
                return False
    return True


def _same_question(subject_dir, a, b):
    if a["marks"] != b["marks"]:
        return False
    if _text_usable(a) and _text_usable(b) and _normalise_text(a["text_excerpt"]) == _normalise_text(b["text_excerpt"]):
        return True
    return _crops_match(subject_dir, a, b)


def find_duplicates(subject_dir, records):
    """Map question id -> id of the first identical question in another variant.

    Candidates share year, session, paper and question number. Only
    duplicates within the same topic are marked; cross-topic matches are
    returned separately as a classification warning.
    """
    groups = defaultdict(list)
    for record in records:
        groups[(record["year"], record["session_code"], record["paper"], record["question_number"])].append(record)
    duplicate_of, cross_topic = {}, []
    for group in groups.values():
        canonical = []
        for record in sorted(group, key=lambda r: r["variant"]):
            match = next((c for c in canonical if _same_question(subject_dir, c, record)), None)
            if match is None:
                canonical.append(record)
            elif match["topic_slug"] == record["topic_slug"]:
                duplicate_of[record["id"]] = match["id"]
            else:
                cross_topic.append((record["id"], match["id"]))
    return duplicate_of, cross_topic


def site_path(subject, path, base=""):
    """Turn a manifest path (relative to the subject dir, or to `base` within it) into a site-root URL."""
    joined = posixpath.normpath(posixpath.join(subject, base, path))
    if joined.startswith(".."):
        raise ValueError(f"{path!r} escapes the site root")
    return "/" + joined


def answer_info(subject, answer):
    if answer is None:
        return {"status": "missing", "reason": "No entry in answers-manifest.json", "image_paths": [],
                "source_pages": [], "mark_scheme_url": None, "mark_scheme_text": ""}
    return {
        "status": answer["status"],
        "reason": answer.get("reason"),
        # Answer image paths are stored relative to the old topic HTML page.
        "image_paths": [site_path(subject, p, answer["topic_slug"]) for p in answer.get("image_paths", [])],
        "source_pages": answer.get("source_pages", []),
        "mark_scheme_url": answer.get("source_pdf_url"),
        "mark_scheme_text": answer.get("text", ""),
    }


def question_entry(subject, record, answer, duplicate_of=None):
    return {
        "id": record["id"],
        "year": record["year"],
        "session": record["session"],
        "session_code": record["session_code"],
        "paper": record["paper"],
        "variant": record["variant"],
        "question_number": record["question_number"],
        "marks": record["marks"],
        "image_paths": [site_path(subject, p) for p in record["image_paths"]],
        "source_pages": record["source_pages"],
        "source_pdf_url": record["source_pdf"],
        "duplicate_of": duplicate_of,
        "answer": answer_info(subject, answer),
    }


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def export_subject(subject):
    subject_dir = ROOT / subject
    manifest = json.loads((subject_dir / "manifest.json").read_text(encoding="utf-8"))
    answers = json.loads((subject_dir / "answers-manifest.json").read_text(encoding="utf-8"))
    answers_by_id = {a["id"]: a for a in answers["records"]}

    out_dir = CONTENT / subject
    if out_dir.exists():
        shutil.rmtree(out_dir)  # drop topics that no longer exist

    duplicates, cross_topic = find_duplicates(subject_dir, manifest["records"])
    by_topic = {topic["slug"]: [] for topic in manifest["topics"]}
    for record in manifest["records"]:
        by_topic[record["topic_slug"]].append(record)

    missing_answers = []
    topics = []
    for topic in manifest["topics"]:
        records = sorted(by_topic[topic["slug"]], key=question_sort_key)
        questions = []
        for record in records:
            answer = answers_by_id.get(record["id"])
            if answer is None:
                missing_answers.append(record["id"])
            questions.append(question_entry(subject, record, answer, duplicates.get(record["id"])))
        write_json(out_dir / "topics" / f"{topic['slug']}.json", {
            "schema": SCHEMA,
            "subject": subject,
            "topic": {"number": topic["number"], "label": topic["label"], "slug": topic["slug"]},
            "questions": questions,
        })
        topics.append({"number": topic["number"], "label": topic["label"], "slug": topic["slug"],
                       "question_count": len(questions),
                       "distinct_count": sum(1 for q in questions if q["duplicate_of"] is None)})

    write_json(out_dir / "index.json", {
        "schema": SCHEMA,
        "subject": subject,
        "subject_name": manifest["subject_name"],
        "syllabus_url": manifest["syllabus_url"],
        "generated": manifest["generated"],
        "topics": topics,
        "papers": [
            {k: p[k] for k in ("year", "session", "session_code", "paper", "variant", "question_count")}
            | {"source_pdf_url": p["source_pdf"]}
            for p in manifest["papers"]
        ],
        "missing_papers": [
            {"year": m["year"], "session": m["session"], "variant": m["variant"],
             "source_pdf_url": m["source_pdf"], "reason": m["reason"]}
            for m in manifest["coverage"]["missing_papers"]
        ],
    })
    return {"subject": subject, "topics": len(topics), "questions": len(manifest["records"]),
            "duplicates": len(duplicates), "cross_topic_duplicates": cross_topic,
            "missing_answers": missing_answers}


def main():
    results = [export_subject(subject) for subject in SUBJECTS]
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    main()
