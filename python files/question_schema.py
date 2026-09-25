#!/usr/bin/env python3
"""The extracted-question format (schema "topicalpaper-question/v1") and its checks.

One file per distinct question: content/{subject}/questions/{questionId}.json.
Used by extract_questions.py (to record problems on drafts), test_content.py,
and the review tool's dev endpoint (`python3 question_schema.py FILE` prints the
problems as JSON). Standard library only.

Text fields use a small format, and nothing else is interpreted:
  - paragraphs separated by a blank line; a single newline is a line break
  - *italic* for variables, `code` for inline code
  - $...$ for TeX (fractions, powers of expressions)
  - ``` fenced blocks ``` for pseudocode and program code, indentation kept
  - [[fig:ID]] on its own paragraph places a figure
  - Unicode for units and symbols (m s⁻², ω, π)
"""
from __future__ import annotations

import json
import re
import sys

SCHEMA = "topicalpaper-question/v1"
STATUSES = {"draft", "reviewed", "rejected"}
KINDS = {"numeric", "written", "diagram", "code"}
PART_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
FIGURE_REF = re.compile(r"\[\[fig:([A-Za-z0-9_-]+)\]\]")


def _text_problems(where, text):
    problems = []
    if not isinstance(text, str) or not text.strip():
        return [f"{where}: empty text"]
    outside_code = re.sub(r"```.*?```", "", text, flags=re.S)
    if outside_code.count("```"):
        problems.append(f"{where}: unclosed ``` code block")
    if outside_code.count("$") % 2:
        problems.append(f"{where}: unbalanced $ (TeX)")
    return problems


def problems(doc, question_marks=None):
    """Every problem with a question file, as human-readable strings. Empty means valid."""
    found = []
    if not isinstance(doc, dict):
        return ["not a JSON object"]
    if doc.get("schema") != SCHEMA:
        found.append(f"schema is {doc.get('schema')!r}, expected {SCHEMA!r}")
    if doc.get("status") not in STATUSES:
        found.append(f"status {doc.get('status')!r} is not one of {sorted(STATUSES)}")
    sources = doc.get("source_images")
    if not isinstance(sources, list) or not sources:
        found.append("source_images is empty")
        sources = []

    texts = []  # (where, text) for figure placement checks
    if doc.get("stem") is not None:
        found += _text_problems("stem", doc["stem"])
        texts.append(("stem", doc.get("stem") or ""))

    parts = doc.get("parts")
    if not isinstance(parts, list) or not parts:
        found.append("no parts")
        parts = []
    seen_ids = set()
    total = 0
    for i, part in enumerate(parts):
        where = f"part {i + 1}"
        if not isinstance(part, dict):
            found.append(f"{where}: not an object")
            continue
        pid = part.get("partId")
        where = f"part {pid or i + 1}"
        if not isinstance(pid, str) or not PART_ID.match(pid):
            found.append(f"{where}: partId {pid!r} must be lowercase like 'a' or 'c-ii'")
        elif pid in seen_ids:
            found.append(f"{where}: duplicate partId")
        seen_ids.add(pid)
        if not isinstance(part.get("label"), str) or not part["label"].strip():
            found.append(f"{where}: missing label")
        found += _text_problems(where, part.get("text"))
        texts.append((where, part.get("text") or ""))
        if part.get("lead") is not None:
            found += _text_problems(f"{where} lead", part["lead"])
            texts.append((f"{where} lead", part.get("lead") or ""))
        marks = part.get("marks")
        if not isinstance(marks, int) or isinstance(marks, bool) or marks < 0:
            found.append(f"{where}: marks {marks!r} must be a whole number")
        else:
            total += marks
        kind = part.get("kind")
        if kind not in KINDS:
            found.append(f"{where}: kind {kind!r} is not one of {sorted(KINDS)}")
        answer = part.get("answer")
        if kind == "numeric":
            if not isinstance(answer, dict) or "unit" not in answer or not isinstance(answer.get("symbol"), str):
                found.append(f"{where}: numeric part needs answer {{symbol, unit}} (unit may be null)")
            elif answer["unit"] is not None and not isinstance(answer["unit"], str):
                found.append(f"{where}: unit must be text or null")
        elif answer is not None:
            found.append(f"{where}: only numeric parts have an answer field")

    if question_marks is not None and parts and total != question_marks:
        found.append(f"part marks add up to {total}, but the question is worth {question_marks}")

    figures = doc.get("figures")
    if not isinstance(figures, list):
        found.append("figures must be a list")
        figures = []
    figure_ids = set()
    for f in figures:
        fid = f.get("id") if isinstance(f, dict) else None
        where = f"figure {fid}"
        if not isinstance(fid, str) or not re.match(r"^[A-Za-z0-9_-]+$", fid):
            found.append(f"{where}: bad id")
            continue
        if fid in figure_ids:
            found.append(f"{where}: duplicate id")
        figure_ids.add(fid)
        if f.get("source_image") not in sources:
            found.append(f"{where}: source_image is not one of source_images")
        size = f.get("source_size")
        if not (isinstance(size, list) and len(size) == 2 and all(isinstance(n, int) and n > 0 for n in size)):
            found.append(f"{where}: source_size must be [width, height] in pixels")
        box = f.get("box")
        if not (isinstance(box, list) and len(box) == 4 and all(isinstance(n, (int, float)) for n in box)):
            found.append(f"{where}: box must be [x0, y0, x1, y1] fractions")
        else:
            x0, y0, x1, y1 = box
            if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
                found.append(f"{where}: box {box} must satisfy 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1")
            elif (x1 - x0) < 0.03 or (y1 - y0) < 0.02:
                found.append(f"{where}: box {box} is too small to be a figure")
        if not isinstance(f.get("alt"), str) or not f["alt"].strip():
            found.append(f"{where}: missing alt text")

    placed = []
    for where, text in texts:
        for ref in FIGURE_REF.findall(text):
            placed.append(ref)
            if ref not in figure_ids:
                found.append(f"{where}: [[fig:{ref}]] has no matching figure")
    for fid in figure_ids:
        count = placed.count(fid)
        if count != 1:
            found.append(f"figure {fid}: placed {count} times in the text, expected once")
    return found


def main(argv):
    """Print the problems of each file as JSON: {path: [problems]}. Exit 1 if any."""
    report = {}
    for path in argv:
        try:
            with open(path, encoding="utf-8") as fh:
                doc = json.load(fh)
        except (OSError, ValueError) as exc:
            report[path] = [f"unreadable: {exc}"]
            continue
        report[path] = problems(doc, doc.get("marks_total"))
    print(json.dumps(report, ensure_ascii=False))
    return 1 if any(report.values()) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
