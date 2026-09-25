#!/usr/bin/env python3
"""Extract structured question text from the existing crops with a vision model.

Writes content/{subject}/questions/{questionId}.json (schema in
question_schema.py) as status "draft" for a person to review. Only distinct
questions are extracted; repeats (duplicate_of) reuse their original.
Reads the PNG crops only; never opens a PDF.

  python3 "python files/extract_questions.py" --pilot --dry-run
  python3 "python files/extract_questions.py" --pilot          (first pilot)
  python3 "python files/extract_questions.py" --pilot 2        (second pilot)
  python3 "python files/extract_questions.py" --subject 9702 --topic 9702-topic-12-motion-in-a-circle
  python3 "python files/extract_questions.py" --ids 9618-2021-mj-31-q04 --redo
  python3 "python files/extract_questions.py" --refit

Figure boxes are fitted to the pixels after the model answers (figure_fit.py),
so an edge never cuts through a label, and copied answer dots become [[blank]].
--refit applies both to files already written, without calling a model, and
keeps their status.

Settings come from llm_config.py (OPENROUTER_API_KEY, OPENROUTER_MODEL).
Model replies are cached in python files/.cache/extract/ (git-ignored), keyed
by model, prompt version and crop bytes, so reruns cost nothing.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

import question_schema
from figure_fit import fit_box

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
CACHE = Path(__file__).resolve().parent / ".cache" / "extract"
SUBJECTS = ("9702", "9618", "9990")
PROMPT_VERSION = "q-extract-4"
PILOTS = {
    "1": {
        "9702": {"topics": ["9702-topic-12-motion-in-a-circle"]},
        "9618": {"ids": ["9618-2021-mj-31-q04", "9618-2021-mj-31-q06", "9618-2021-mj-31-q09"]},
    },
    # The hard cases: circuits and graphs, pseudocode and trace tables, and a
    # spread of psychology questions (sample: that many, evenly across the topic).
    "2": {
        "9702": {"topics": ["9702-topic-19-capacitance"]},
        "9618": {"topics": ["9618-topic-19-computational-thinking-and-problem-solving"]},
        "9990": {"topics": ["9990-topic-01-clinical-psychology"], "sample": 15},
    },
}

SYSTEM_PROMPT = """You transcribe Cambridge International A-Level exam questions from scanned page crops into JSON.
Transcribe exactly what is printed. Never answer the question, never add hints, never invent text.

Return one JSON object with these keys:
{
  "stem": text printed before the first lettered part, or null,
  "parts": [
    {
      "partId": "a", "b", "c-i", "c-ii" ... (lowercase, hyphen between levels),
      "label": as printed, fully qualified: "(a)", "(c)(i)", "(c)(ii)",
      "lead": text printed under a parent label that introduces several sub-parts
              (e.g. the text after "(c)" that (c)(i) and (c)(ii) both use), put it on the
              FIRST sub-part only; otherwise null,
      "text": the part's own text, including any setup sentences before its instruction,
      "marks": the number in square brackets for this part, e.g. [2] -> 2,
      "kind": "numeric" (answer is a value on an answer line like "v = ........ m s-1"),
              "written" (words or explanation), "diagram" (draw, sketch, complete a table
              or graph on the paper), or "code" (write or complete program code/pseudocode),
      "slots": when the printed answer space is split into LABELLED spaces (e.g.
               "Benefit 1 ......", "Benefit 2 ......", or "Advantage ....." and
               "Disadvantage ....."), those labels in order; otherwise null. Don't
               repeat the labels in "text",
      "answer": for numeric parts {"symbol": what is left of "=" on the answer line, or null
                if there is no "=", "unit": the unit printed after the dotted line, or null};
                otherwise null
    }
  ],
  "figures": [
    {"id": "f1", "image": index of the crop it is in (0 for the first image),
     "box": [x0, y0, x1, y1] as FRACTIONS (0 to 1) of that image's width and height,
            around the whole figure INCLUDING every label, value, angle, arrow and axis
            number that belongs to it (when unsure, make the box larger), but NOT its
            caption line (give that as "caption"),
     "caption": e.g. "Fig. 1.1", "alt": one sentence describing what it shows}
  ],
  "notes": ["anything you could not read or were unsure of"]
}

If the question has no lettered parts, return ONE part with partId "main" and
label "" holding all of its text, and set "stem" to null.

Text format (nothing else is interpreted):
- Blank line between paragraphs; single newline for a line break.
- *italic* for variables and quantity symbols (*L*, *ω*, *T*). Use × for multiplication, never *.
- `backticks` for short inline code or expressions printed in a code font.
- ```fenced blocks``` for pseudocode or program listings, keeping indentation.
- $...$ TeX only when Unicode can't show it (fractions, powers of expressions).
- Unicode for units and symbols: m s⁻², rad s⁻¹, ω, π, Ω, °, ×10⁻³.
- Put [[fig:f1]] on its own paragraph exactly where the figure appears.
- [[blank]] marks each gap the student fills in INSIDE a sentence or a line of code,
  e.g. `IF [[blank]] THEN` or `Item ← [[blank]]`; a whole line left for the student
  inside code is [[blank]] alone on that line. Keep every printed character around it.
  Never drop a gap, and never copy its dots.
- Diagrams, graphs, circuits and tables are figures, not text.

Leave out: dotted answer lines BELOW a question for a written answer (gaps inside
code or sentences are [[blank]], see above), "[Total: N]", page numbers, "© UCLES", paper codes,
"[Turn over", "BLANK PAGE", and the question number itself."""


class StopRun(Exception):
    """Stop the whole run (bad key, daily limit, no credit). Work so far is kept."""


class ReplyError(Exception):
    """This question's reply was unusable; move on to the next question."""


# ---------- selecting questions -------------------------------------------------

def load_topics(subject):
    index = json.loads((CONTENT / subject / "index.json").read_text(encoding="utf-8"))
    for topic in index["topics"]:
        data = json.loads((CONTENT / subject / "topics" / f"{topic['slug']}.json").read_text(encoding="utf-8"))
        yield topic["slug"], data["questions"]


def select(args):
    wanted_ids = set(args.ids or [])
    chosen = []
    for subject in SUBJECTS:
        if args.subject and subject != args.subject:
            continue
        pilot = PILOTS[args.pilot].get(subject, {}) if args.pilot else None
        if args.pilot and not pilot:
            continue
        picked = []
        for slug, questions in load_topics(subject):
            for q in questions:
                if q["duplicate_of"] is not None or not q["image_paths"]:
                    continue  # repeats reuse their original; nothing to read without crops
                if wanted_ids and q["id"] not in wanted_ids:
                    continue
                if args.topic and slug != args.topic:
                    continue
                if pilot and not (slug in pilot.get("topics", []) or q["id"] in pilot.get("ids", [])):
                    continue
                picked.append((subject, slug, q))
        sample = pilot.get("sample") if pilot else None
        if sample and len(picked) > sample:
            picked = [picked[i * len(picked) // sample] for i in range(sample)]
        chosen += picked
    missing = wanted_ids - {q["id"] for _, _, q in chosen}
    if missing:
        raise SystemExit(f"Not found, or a repeat of another question: {', '.join(sorted(missing))}")
    return chosen[: args.limit] if args.limit else chosen


def output_path(subject, qid):
    return CONTENT / subject / "questions" / f"{qid}.json"


# ---------- talking to the model ------------------------------------------------

def crop_files(q):
    return [ROOT / p.lstrip("/") for p in q["image_paths"]]


def user_content(q, files):
    sizes = []
    for f in files:
        with Image.open(f) as im:
            sizes.append(im.size)
    described = "; ".join(f"image {i} is {w}×{h} px" for i, (w, h) in enumerate(sizes))
    marks = f"The whole question is worth {q['marks']} marks." if q["marks"] else "The total mark is not known."
    content = [{"type": "text", "text": (
        f"Question {q['question_number']} from {q['session']} {q['year']}, paper {q['variant']}. "
        f"It spans {len(files)} crop(s), in order: {described}. {marks} Return only the JSON object."
    )}]
    for f in files:
        data = base64.b64encode(f.read_bytes()).decode("ascii")
        content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{data}"}})
    return content, sizes


def cache_key(model, files):
    h = hashlib.sha256(f"{model}\n{PROMPT_VERSION}\n{SYSTEM_PROMPT}".encode())
    for f in files:
        h.update(f.read_bytes())
    return h.hexdigest()


class Client:
    def __init__(self, config, min_interval, timeout=180):
        self.config = config
        self.min_interval = min_interval
        self.timeout = timeout
        self.use_json_mode = True
        self.last_call = 0.0
        self.requests = 0

    def _post(self, body):
        wait = self.min_interval - (time.monotonic() - self.last_call)
        if wait > 0:
            time.sleep(wait)
        self.last_call = time.monotonic()
        self.requests += 1
        req = urllib.request.Request(
            f"{self.config.base_url.rstrip('/')}/chat/completions",
            data=json.dumps(body).encode(),
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://topicalpaper.me",
                "X-Title": "topicalpaper.me question extraction",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as res:
            return json.loads(res.read().decode("utf-8"))

    def complete(self, messages):
        """Return the model's reply text, retrying rate limits and transient failures."""
        attempt = 0
        while True:
            body = {"model": self.config.model, "messages": messages, "temperature": 0, "max_tokens": 6000}
            if self.use_json_mode:
                body["response_format"] = {"type": "json_object"}
            try:
                data = self._post(body)
            except urllib.error.HTTPError as err:
                detail = err.read().decode("utf-8", "replace")[:500]
                if err.code == 400 and self.use_json_mode and "response_format" in detail:
                    self.use_json_mode = False  # this model doesn't support JSON mode; ask in the prompt only
                    continue
                if err.code in (401, 403):
                    raise StopRun(f"OpenRouter refused the key (HTTP {err.code}): {detail}")
                if err.code == 402:
                    raise StopRun(f"OpenRouter says the account has no credit for this model: {detail}")
                if err.code == 429 and ("per-day" in detail or "per day" in detail or "daily" in detail):
                    raise StopRun(f"Daily free-model limit reached; run again later to continue. ({detail})")
                if err.code in (408, 429, 500, 502, 503, 504) and attempt < 4:
                    attempt += 1
                    retry_after = err.headers.get("Retry-After") if err.headers else None
                    delay = float(retry_after) if retry_after and retry_after.replace(".", "", 1).isdigit() else 5 * 2 ** attempt
                    print(f"    HTTP {err.code}, retrying in {delay:.0f}s", flush=True)
                    time.sleep(delay)
                    continue
                raise ReplyError(f"HTTP {err.code}: {detail}")
            except (urllib.error.URLError, TimeoutError) as err:
                if attempt < 3:
                    attempt += 1
                    time.sleep(5 * 2 ** attempt)
                    continue
                raise ReplyError(f"network error: {err}")
            if "error" in data:
                raise ReplyError(f"model error: {json.dumps(data['error'])[:500]}")
            try:
                content = data["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                raise ReplyError(f"unexpected reply shape: {json.dumps(data)[:300]}")
            if isinstance(content, list):  # some providers return content parts
                content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
            return content or ""


def parse_reply(text):
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fenced:
        text = fenced.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            text = text[start : end + 1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("reply is not a JSON object")
    return data


def ask_model(client, q, files):
    """The model's parsed reply for one question, from cache when possible."""
    CACHE.mkdir(parents=True, exist_ok=True)
    key = cache_key(client.config.model, files)
    cached = CACHE / f"{key}.json"
    if cached.is_file():
        return json.loads(cached.read_text(encoding="utf-8")), True
    content, _ = user_content(q, files)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": content}]
    reply = client.complete(messages)
    try:
        data = parse_reply(reply)
    except ValueError as err:
        # One repair attempt: show the model its own reply and the error.
        messages += [
            {"role": "assistant", "content": reply},
            {"role": "user", "content": f"That was not valid JSON ({err}). Reply with only the corrected JSON object."},
        ]
        try:
            data = parse_reply(client.complete(messages))
        except ValueError as err2:
            raise ReplyError(f"reply was not valid JSON twice: {err2}")
    cached.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data, False


# ---------- building the question file -----------------------------------------

def to_question_file(subject, q, reply, model):
    files = crop_files(q)
    sizes = []
    for f in files:
        with Image.open(f) as im:
            sizes.append(list(im.size))
    figures, notes = [], [n for n in reply.get("notes") or [] if isinstance(n, str) and n.strip()]
    for fig in reply.get("figures") or []:
        if not isinstance(fig, dict):
            continue
        index = fig.get("image", 0)
        index = index if isinstance(index, int) and 0 <= index < len(files) else 0
        box = fig.get("box")
        if isinstance(box, list) and len(box) == 4 and all(isinstance(n, (int, float)) for n in box):
            if max(box) > 1:
                # Asked for fractions; some models answer in pixels or on a 0-1000 grid.
                # Guess pixels when the box fits the image, and flag it for the reviewer.
                w, h = sizes[index]
                fits = box[2] <= w and box[3] <= h
                scale = (w, h, w, h) if fits else (1000,) * 4
                box = [min(1, max(0, n / s)) for n, s in zip(box, scale)]
                notes.append(f"Figure {fig.get('id')}: box was not given as fractions; check its crop.")
            box = fit_box(files[index], box)
        figures.append({
            "id": str(fig.get("id") or f"f{len(figures) + 1}"),
            "caption": fig.get("caption") or None,
            "alt": fig.get("alt") or "",
            "source_image": q["image_paths"][index],
            "source_size": sizes[index],
            "box": box,
        })
    stem = reply.get("stem") or None
    if not reply.get("parts") and stem:
        # No lettered parts: the whole question is one part (question_schema.SINGLE_PART).
        reply = {**reply, "parts": [{"partId": question_schema.SINGLE_PART, "label": "", "text": stem,
                                     "marks": q["marks"], "kind": "written", "slots": reply.get("slots"),
                                     "answer": None}]}
        stem = None
        notes.append("No lettered parts: made one part from the question text; check its kind.")
    parts = []
    for part in reply.get("parts") or []:
        if not isinstance(part, dict):
            continue
        kind = part.get("kind")
        parts.append({
            "partId": part.get("partId"),
            "label": part.get("label") if part.get("label") is not None else "",
            "lead": _mark_blanks(part.get("lead")) or None,
            "text": _mark_blanks(part.get("text")),
            "marks": part.get("marks"),
            "kind": kind,
            "slots": _slots(part.get("slots")) if kind in ("written", "code") else None,
            "answer": part.get("answer") if kind == "numeric" else None,
        })
    doc = {
        "schema": question_schema.SCHEMA,
        "id": q["id"],
        "subject": subject,
        "status": "draft",
        "extracted_with": {"model": model, "prompt": PROMPT_VERSION, "date": dt.date.today().isoformat()},
        "source_images": q["image_paths"],
        "marks_total": q["marks"],
        "stem": stem,
        "parts": parts,
        "figures": figures,
        "notes": notes,
    }
    doc["problems"] = question_schema.problems(doc, q["marks"])
    doc["warnings"] = question_schema.warnings(doc)
    return doc


DOT_RUN = re.compile(r"(?:\.\s?){5,}|(?:…\s?){2,}")
CODE_FENCE = re.compile(r"```.*?```", re.S)
# Pseudocode never uses a bare "..." or "…", so in code it is always a gap.
CODE_GAP = re.compile(r"(?<![\w.])(?:\.\.\.|…)(?![\w.])")


def _mark_blanks(text):
    """Gaps the model copied as dots become [[blank]]: 5+ dots or 2+ ellipses
    anywhere, and a bare "..." or "…" inside code."""
    if not isinstance(text, str):
        return text
    text = DOT_RUN.sub(lambda m: "[[blank]]" + (" " if m.group(0).endswith(" ") else ""), text)
    return CODE_FENCE.sub(lambda m: CODE_GAP.sub("[[blank]]", m.group(0)), text)


def _slots(value):
    """Labelled answer spaces, or None. A lone label isn't a split."""
    if not isinstance(value, list):
        return None
    labels = [v.strip() for v in value if isinstance(v, str) and v.strip()]
    return labels if len(labels) >= 2 else None


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def refit(args):
    """Apply today's clean-ups to files already written, without a model: fit figure
    boxes (drafts only), turn copied dots into [[blank]], and re-check problems.
    Keeps status."""
    changed = 0
    paths = sorted(CONTENT.glob(f"{args.subject or '*'}/questions/*.json"))
    if args.ids:
        paths = [p for p in paths if p.stem in set(args.ids)]
    # Marks come from the exported topics, which may have been corrected since.
    marks = {q["id"]: q["marks"] for subject in SUBJECTS if (CONTENT / subject / "index.json").is_file()
             for _, questions in load_topics(subject) for q in questions}
    for path in paths:
        doc = json.loads(path.read_text(encoding="utf-8"))
        before = json.dumps(doc, ensure_ascii=False)
        doc["marks_total"] = marks.get(doc.get("id"), doc.get("marks_total"))
        moved = []
        blanks = 0
        if doc.get("stem"):
            doc["stem"] = _mark_blanks(doc["stem"])
        for part in doc.get("parts") or []:
            for key in ("lead", "text"):
                if isinstance(part.get(key), str):
                    new_text = _mark_blanks(part[key])
                    blanks += new_text.count("[[blank]]") - part[key].count("[[blank]]")
                    part[key] = new_text
        # A reviewer has checked (maybe dragged) the boxes of reviewed files: leave them.
        for fig in (doc.get("figures") or []) if doc.get("status") == "draft" else []:
            box = fig.get("box")
            if not (isinstance(box, list) and len(box) == 4 and fig.get("source_image")):
                continue
            new = fit_box(ROOT / fig["source_image"].lstrip("/"), box)
            if new != box:
                fig["box"] = new
                moved.append(fig.get("id"))
        doc["problems"] = question_schema.problems(doc, doc.get("marks_total"))
        doc["warnings"] = question_schema.warnings(doc)
        if json.dumps(doc, ensure_ascii=False) != before:
            write_json(path, doc)
            changed += 1
            what = [f"refitted {', '.join(map(str, moved))}"] if moved else []
            what += [f"{blanks} blank(s) marked"] if blanks else []
            what += [f"{len(doc['problems'])} problem(s) now"] if doc["problems"] else []
            what += [f"{len(doc['warnings'])} warning(s)"] if doc["warnings"] else []
            print(f"  {doc['id']}: {'; '.join(what) or 'problems re-checked'}")
    print(f"Updated {changed} of {len(paths)} question file(s).")
    return 0


# ---------- main ----------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--subject", choices=SUBJECTS)
    ap.add_argument("--topic", help="topic slug")
    ap.add_argument("--ids", nargs="+", help="question ids")
    ap.add_argument("--pilot", nargs="?", const="1", choices=sorted(PILOTS),
                    help="1: motion in a circle + 9618 s21 paper 31 Q4, Q6, Q9; "
                         "2: 9702 capacitance, 9618 computational thinking, 15 of 9990 clinical")
    ap.add_argument("--limit", type=int, help="at most N questions")
    ap.add_argument("--redo", action="store_true", help="re-extract drafts too (reviewed/rejected need --force)")
    ap.add_argument("--force", action="store_true", help="also overwrite reviewed and rejected files")
    ap.add_argument("--dry-run", action="store_true", help="list what would be extracted; no key needed")
    ap.add_argument("--min-interval", type=float, default=4.0, help="seconds between requests (default 4)")
    ap.add_argument("--refit", "--refit-figures", dest="refit", action="store_true",
                    help="clean up existing question files (fit figure boxes, mark [[blank]]s, "
                         "re-check problems); no model calls")
    ap.add_argument("--fake-responses", type=Path, help="read {id}.response.json from this folder instead of calling a model")
    args = ap.parse_args(argv)
    if args.refit:
        return refit(args)

    chosen = select(args)
    todo, skipped = [], []
    for subject, slug, q in chosen:
        path = output_path(subject, q["id"])
        status = json.loads(path.read_text(encoding="utf-8")).get("status") if path.is_file() else None
        if status in ("reviewed", "rejected") and not args.force:
            skipped.append((q["id"], status))
        elif status == "draft" and not (args.redo or args.force):
            skipped.append((q["id"], "draft"))
        else:
            todo.append((subject, slug, q))
    print(f"{len(chosen)} distinct questions selected, {len(todo)} to extract, {len(skipped)} already done")
    if args.dry_run:
        for subject, slug, q in todo:
            print(f"  {q['id']}  ({len(q['image_paths'])} crop{'s' if len(q['image_paths']) != 1 else ''})")
        print(f"Needs up to {len(todo)} model requests (plus retries); cached replies are free.")
        return 0

    if args.fake_responses:
        client, model = None, "fixture:hand-transcribed"
    else:
        import llm_config  # only needed for real calls
        config = llm_config.load_config()
        client, model = Client(config, args.min_interval), config.model

    written = cached_hits = 0
    failed, with_problems = [], []
    for n, (subject, slug, q) in enumerate(todo, 1):
        print(f"[{n}/{len(todo)}] {q['id']}", flush=True)
        try:
            if args.fake_responses:
                reply, from_cache = json.loads((args.fake_responses / f"{q['id']}.response.json").read_text(encoding="utf-8")), False
            else:
                reply, from_cache = ask_model(client, q, crop_files(q))
        except StopRun as stop:
            print(f"Stopped: {stop}")
            break
        except (ReplyError, OSError, ValueError) as err:
            failed.append((q["id"], str(err)))
            print(f"    failed: {err}")
            continue
        cached_hits += from_cache
        doc = to_question_file(subject, q, reply, model)
        write_json(output_path(subject, q["id"]), doc)
        written += 1
        if doc["problems"]:
            with_problems.append(q["id"])
            print(f"    {len(doc['problems'])} problem(s) for review: {doc['problems'][0]}")

    requests = client.requests if client else 0
    print(f"\nWrote {written} draft(s) ({cached_hits} from cache), {len(with_problems)} with problems, "
          f"{len(failed)} failed, {requests} model request(s).")
    for qid, err in failed:
        print(f"  failed {qid}: {err}")
    touched = {}
    for subject, slug, q in todo:
        if output_path(subject, q["id"]).is_file():
            touched.setdefault((subject, slug), 0)
            touched[(subject, slug)] += 1
    if touched:
        print("\nTo review (npm run dev --prefix web, then open these; /app/dev/review lists them too):")
        for (subject, slug), n in touched.items():
            print(f"  {n:>3}  http://localhost:5173/app/dev/review/{subject}/{slug}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
