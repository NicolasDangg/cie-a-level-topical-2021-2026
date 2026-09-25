#!/usr/bin/env python3
"""Export the app's content JSON from the existing manifests.

Reads each subject's manifest.json and answers-manifest.json and writes
content/{subject}/index.json and content/{subject}/topics/{slug}.json.
Never opens a PDF or renders an image: image paths are the existing PNG
files, rewritten as site-root URLs (e.g. /9618/<topic>/assets/<file>.png).
"""
from __future__ import annotations

import json
import posixpath
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
SCHEMA = "topicalpaper-content/v2"
SUBJECTS = ("9702", "9618", "9990")


def question_sort_key(record):
    # Same order as the generated questions.html pages.
    return (record["year"], record["session_code"], record["variant"], record["question_number"])


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


def question_entry(subject, record, answer):
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
            questions.append(question_entry(subject, record, answer))
        write_json(out_dir / "topics" / f"{topic['slug']}.json", {
            "schema": SCHEMA,
            "subject": subject,
            "topic": {"number": topic["number"], "label": topic["label"], "slug": topic["slug"]},
            "questions": questions,
        })
        topics.append({"number": topic["number"], "label": topic["label"], "slug": topic["slug"],
                       "question_count": len(questions)})

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
            "missing_answers": missing_answers}


def main():
    results = [export_subject(subject) for subject in SUBJECTS]
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    main()
