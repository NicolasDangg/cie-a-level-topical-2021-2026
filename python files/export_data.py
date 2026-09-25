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


# ---------- mark-scheme "tape": where each part's row sits on a page ----------
# Mark-scheme pages are ruled tables (Question | Answer | Marks). A row whose
# Question cell is empty continues the part above, so rows merge into one
# band per part. The app covers the Answer and Marks columns of each band
# with tape the student peels off, leaving the printed part label visible.

# The crop pipeline summed every "[N]" in a question's text as marks, so array
# index labels ("[1] [2] … [10]") were counted too. These are the printed
# totals, checked against each paper's 75 marks. generate_question_assets.py
# now skips such labels; this fixes the existing manifests without a PDF run.
MARKS_CORRECTIONS = {
    "9618-2025-mj-33-q13": 4,   # two tables indexed [1]..[10]: counted 114
    "9618-2021-on-41-q03": 28,  # arrays indexed [0]..[2]: counted 34
    "9618-2021-on-42-q03": 28,
}

RULE_FRACTION = 0.55  # a horizontal rule spans most of the page width
TAPE_CACHE = Path(__file__).resolve().parent / ".cache" / "tape.json"
TAPE_VERSION = 3
_tape_cache = None


def _runs(flags, gap=3):
    """Centres of runs of True values (a rule is a few pixels thick)."""
    runs = []
    for i, on in enumerate(flags):
        if not on:
            continue
        if runs and i - runs[-1][1] <= gap:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    return [(a + b) // 2 for a, b in runs]


def _detect_tape(image_path):
    with Image.open(image_path) as im:
        gray = im.convert("L")
    width, height = gray.size
    ink = gray.point(lambda v: 0 if v < 160 else 255).tobytes()
    dark = lambda y, x0, x1: ink[y * width + x0:y * width + x1].count(0)  # noqa: E731
    rules = _runs([dark(y, 0, width) / width > RULE_FRACTION for y in range(height)])
    if len(rules) < 2:
        return None
    # Column rules, read from the header row between the first two rules, where
    # every column border is drawn.
    head_top, head_bottom = rules[0] + 3, rules[1] - 2
    if head_bottom - head_top < 5:
        return None
    header = gray.crop((0, head_top, width, head_bottom)).point(lambda v: 0 if v < 160 else 255)
    h_w, h_h = header.size
    head = header.tobytes()
    column_ink = [sum(head[r * h_w + x] == 0 for r in range(h_h)) / h_h for x in range(h_w)]
    verticals = _runs([f > 0.9 for f in column_ink], gap=2)
    if len(verticals) < 3:
        return None
    q_left, q_right, right = verticals[0], verticals[1], verticals[-1]

    def in_table(y):  # the table's left border is drawn at this height
        return dark(y, max(0, q_left - 2), q_left + 3) > 0

    def divided(y0, y1):  # a Question | Answer divider runs through this band
        return all(dark(y, q_right - 2, q_right + 3) for y in range(y0 + 4, max(y0 + 5, y1 - 3), 3))

    # The last table on the page ends where its left border last appears (a table
    # may run on to the next page without a bottom rule; gaps between tables are
    # handled per band below).
    bottom = next((y for y in range(height - 1, rules[1], -1) if in_table(y)), rules[1])
    edges = sorted({*[r for r in rules if r <= bottom + 3], bottom})
    bands, skip_next = [], True  # the first band is the header row
    for y0, y1 in zip(edges, edges[1:]):
        mid = (y0 + y1) // 2
        if y1 - y0 < 6:
            continue
        if not in_table(mid):
            skip_next = True  # a gap between two tables; the next band is a repeated header
            continue
        if skip_next:
            skip_next = False
            continue
        if not divided(y0, y1):
            # One cell across Question and Answer (e.g. program code): cover it all.
            if bands and not bands[-1][2]:
                bands[-1][1] = y1
            else:
                bands.append([y0, y1, True])
            continue
        labelled = any(dark(y, q_left + 4, q_right - 3) for y in range(y0 + 4, max(y0 + 5, y1 - 3)))
        if labelled or not bands or bands[-1][2]:
            bands.append([y0, y1, False])
        else:
            bands[-1][1] = y1  # continuation row: same part
    if not bands:
        return None
    return {
        # Tape runs from the Question column's right rule to the table's right edge;
        # "wide" bands also cover the Question column.
        "x": [round(q_left / width, 4), round(q_right / width, 4), round(right / width, 4)],
        "bands": [{"y": [round(a / height, 4), round(b / height, 4)], "wide": wide} for a, b, wide in bands],
    }


def mark_scheme_tape(image_path):
    """{"x": [table left, answer left, table right], "bands": [{"y": [y0, y1], "wide": bool}]}
    as fractions of the page, or None when no table is found.

    Cached on disk by path, size and modification time, so re-exports are fast.
    """
    global _tape_cache
    if _tape_cache is None:
        try:
            _tape_cache = json.loads(TAPE_CACHE.read_text(encoding="utf-8"))
            if _tape_cache.get("version") != TAPE_VERSION:
                _tape_cache = {"version": TAPE_VERSION}
        except (OSError, ValueError):
            _tape_cache = {"version": TAPE_VERSION}
    stat = image_path.stat()
    key = f"{image_path.relative_to(ROOT)}:{stat.st_size}:{int(stat.st_mtime)}"
    if key not in _tape_cache:
        _tape_cache[key] = _detect_tape(image_path)
    return _tape_cache[key]


def save_tape_cache():
    if _tape_cache is not None:
        TAPE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        TAPE_CACHE.write_text(json.dumps(_tape_cache), encoding="utf-8")


def site_path(subject, path, base=""):
    """Turn a manifest path (relative to the subject dir, or to `base` within it) into a site-root URL."""
    joined = posixpath.normpath(posixpath.join(subject, base, path))
    if joined.startswith(".."):
        raise ValueError(f"{path!r} escapes the site root")
    return "/" + joined


def answer_info(subject, answer, subject_dir=None):
    if answer is None:
        return {"status": "missing", "reason": "No entry in answers-manifest.json", "image_paths": [],
                "source_pages": [], "mark_scheme_url": None, "mark_scheme_text": ""}
    return {
        "status": answer["status"],
        "reason": answer.get("reason"),
        # Answer image paths are stored relative to the old topic HTML page.
        "image_paths": [site_path(subject, p, answer["topic_slug"]) for p in answer.get("image_paths", [])],
        # Per image: where to lay tape over each part (null when no table was found).
        "tape": [
            mark_scheme_tape(ROOT / site_path(subject, p, answer["topic_slug"]).lstrip("/"))
            for p in answer.get("image_paths", [])
        ],
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
        "marks": MARKS_CORRECTIONS.get(record["id"], record["marks"]),
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
    # Replace only what the export owns; content/{subject}/questions/ holds
    # reviewed extractions and must survive every export.
    if (out_dir / "topics").exists():
        shutil.rmtree(out_dir / "topics")  # drop topics that no longer exist

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
    save_tape_cache()
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    main()
