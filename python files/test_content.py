#!/usr/bin/env python3
"""Checks for the exported content/ JSON against the source manifests.

Never opens a PDF. Run after export_data.py.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
SCHEMA = "topicalpaper-content/v2"
SUBJECTS = ("9702", "9618", "9990")
# Pinned totals (carried over from test_answer_links.py, 9990 added).
EXPECTED_COUNTS = {"9702": 436, "9618": 407, "9990": 752}
ID_RE = re.compile(r"^(9702|9618|9990)-20\d\d-(m|mj|on)-\d\d-q\d\d$")

failures = []
warnings = []


def check(condition, message):
    if not condition:
        failures.append(message)
    return condition


def load(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        failures.append(f"{path.relative_to(ROOT)}: does not parse ({exc})")
        return None
    check(isinstance(data, dict) and data.get("schema") == SCHEMA,
          f"{path.relative_to(ROOT)}: missing or wrong schema field")
    return data


def png_exists(url):
    return url.startswith("/") and url.endswith(".png") and (ROOT / url.lstrip("/")).is_file()


def check_subject(subject):
    manifest = json.loads((ROOT / subject / "manifest.json").read_text(encoding="utf-8"))
    answers = json.loads((ROOT / subject / "answers-manifest.json").read_text(encoding="utf-8"))
    source = {r["id"]: r for r in manifest["records"]}
    source_answers = {a["id"]: a for a in answers["records"]}

    check(len(source) == len(manifest["records"]), f"{subject}: duplicate ids in manifest.json")
    check(len(manifest["records"]) == EXPECTED_COUNTS[subject],
          f"{subject}: manifest has {len(manifest['records'])} records, expected {EXPECTED_COUNTS[subject]}")
    check(set(source_answers) == set(source), f"{subject}: answers-manifest ids differ from manifest ids")

    # Every JSON file under content/{subject} parses and carries the schema.
    for path in sorted((CONTENT / subject).rglob("*.json")):
        load(path)

    index = load(CONTENT / subject / "index.json")
    if index is None:
        return 0
    check(index["subject"] == subject, f"{subject}: index subject is {index['subject']!r}")
    check([t["slug"] for t in index["topics"]] == [t["slug"] for t in manifest["topics"]],
          f"{subject}: index topics differ from manifest topics")
    check(len(index["papers"]) == len(manifest["papers"]), f"{subject}: paper count differs")
    check(len(index["missing_papers"]) == len(manifest["coverage"]["missing_papers"]),
          f"{subject}: missing-paper count differs")
    topic_files = {p.stem for p in (CONTENT / subject / "topics").glob("*.json")}
    check(topic_files == {t["slug"] for t in index["topics"]}, f"{subject}: stray or missing topic files")

    seen = {}
    for topic in index["topics"]:
        slug = topic["slug"]
        data = load(CONTENT / subject / "topics" / f"{slug}.json")
        if data is None:
            continue
        questions = data["questions"]
        expected_ids = [r["id"] for r in manifest["records"] if r["topic_slug"] == slug]
        check(topic["question_count"] == len(questions) == len(expected_ids),
              f"{slug}: count index={topic['question_count']} file={len(questions)} manifest={len(expected_ids)}")
        check([q["id"] for q in questions] == sorted(expected_ids, key=lambda i: (
                  source[i]["year"], source[i]["session_code"], source[i]["variant"], source[i]["question_number"])),
              f"{slug}: question order differs from the questions.html order")

        # While the old pages still exist, confirm order against them directly.
        old_html = ROOT / subject / slug / "questions.html"
        if old_html.is_file():
            html_ids = re.findall(r"<article class='question' id='([^']+)'", old_html.read_text(encoding="utf-8"))
            check(html_ids == [q["id"] for q in questions], f"{slug}: order differs from {old_html.name}")

        for q in questions:
            qid = q["id"]
            check(qid not in seen, f"{qid}: appears in {seen.get(qid)} and {slug}")
            seen[qid] = slug
            check(bool(ID_RE.match(qid)), f"{qid}: malformed id")
            check("text_excerpt" not in q, f"{qid}: text_excerpt leaked into content")
            r = source.get(qid)
            if not check(r is not None, f"{qid}: not in manifest.json"):
                continue
            for key in ("year", "session", "session_code", "paper", "variant", "question_number", "marks", "source_pages"):
                check(q[key] == r[key], f"{qid}: {key} {q[key]!r} != manifest {r[key]!r}")
            check(q["source_pdf_url"] == r["source_pdf"], f"{qid}: source PDF URL differs")
            # Same PNG files as before, just rooted at the site root.
            check(q["image_paths"] == [f"/{subject}/{p}" for p in r["image_paths"]], f"{qid}: image paths differ")
            for url in q["image_paths"]:
                check(png_exists(url), f"{qid}: missing question PNG {url}")
            if not q["image_paths"]:
                warnings.append(f"{qid}: no question crops (marks={q['marks']})")

            a = q.get("answer")
            sa = source_answers.get(qid)
            if not check(a is not None and a["status"] != "missing" and sa is not None, f"{qid}: no answer entry"):
                continue
            check(a["status"] == sa["status"], f"{qid}: answer status differs")
            check(a["mark_scheme_url"] == sa["source_pdf_url"], f"{qid}: mark-scheme URL differs")
            check(a["mark_scheme_text"] == sa["text"], f"{qid}: mark-scheme text differs")
            check(a["source_pages"] == sa["source_pages"], f"{qid}: answer source pages differ")
            check(len(a["image_paths"]) == len(sa["image_paths"]), f"{qid}: answer image count differs")
            for url in a["image_paths"]:
                check(png_exists(url), f"{qid}: missing answer PNG {url}")
            if a["status"] == "available":
                check(bool(a["mark_scheme_text"]) and bool(a["image_paths"]), f"{qid}: available answer is empty")

    check(set(seen) == set(source), f"{subject}: {len(set(source) - set(seen))} manifest questions not exported")
    return len(seen)


def main():
    totals = {}
    for subject in SUBJECTS:
        totals[subject] = check_subject(subject)
    stray = {p.name for p in CONTENT.iterdir()} - set(SUBJECTS) if CONTENT.is_dir() else set()
    check(not stray, f"content/: unexpected entries {sorted(stray)}")

    for subject, count in totals.items():
        print(f"{subject}: {count} questions exported")
    for w in warnings:
        print(f"WARNING {w}")
    if failures:
        for f in failures[:50]:
            print(f"FAIL {f}")
        print(f"{len(failures)} failure(s)")
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
