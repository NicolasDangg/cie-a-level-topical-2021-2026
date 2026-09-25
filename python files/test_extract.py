#!/usr/bin/env python3
"""Offline tests for extract_questions.py against a fake OpenRouter server.

Covers: JSON-mode fallback, rate-limit retry, the daily cap stopping a run,
repairing a non-JSON reply, fenced replies, caching, never overwriting a
reviewed file, box normalisation, fitting boxes to labels, --refit-figures,
and the question_schema checks.
Uses the real crops of 9702-2023-on-42-q01; never calls a real model.
"""
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_questions as ex  # noqa: E402
import figure_fit  # noqa: E402
import question_schema  # noqa: E402

QID = "9702-2023-on-42-q01"
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "extract" / f"{QID}.response.json").read_text(encoding="utf-8"))
failures = []


def check(cond, msg):
    if not cond:
        failures.append(msg)


class FakeOpenRouter(BaseHTTPRequestHandler):
    script = []  # list of (status, headers, body) consumed in order
    requests = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeOpenRouter.requests.append({"body": body, "auth": self.headers.get("Authorization")})
        status, headers, payload = FakeOpenRouter.script.pop(0)
        data = payload if isinstance(payload, (bytes, str)) else json.dumps(payload)
        data = data.encode() if isinstance(data, str) else data
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


def reply(text):
    return (200, {}, {"choices": [{"message": {"role": "assistant", "content": text}}]})


def run(tmp, script, *extra):
    FakeOpenRouter.script = list(script)
    FakeOpenRouter.requests = []
    code = ex.main(["--ids", QID, "--min-interval", "0", *extra])
    return code, FakeOpenRouter.requests, FakeOpenRouter.script


def main():
    server = HTTPServer(("127.0.0.1", 0), FakeOpenRouter)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    os.environ.update({
        "OPENROUTER_API_KEY": "test-key",
        "OPENROUTER_MODEL": "test/vision:free",
        "OPENROUTER_BASE_URL": f"http://127.0.0.1:{server.server_port}/api/v1",
    })
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        ex.CACHE = tmp / "cache"
        ex.output_path = lambda subject, qid: tmp / "out" / subject / f"{qid}.json"
        out = tmp / "out" / "9702" / f"{QID}.json"
        ex.time.sleep = lambda s: None  # no real waiting in tests

        # 1. Model rejects JSON mode, then rate-limits once, then answers in a fenced block.
        code, reqs, left = run(tmp, [
            (400, {}, {"error": {"message": "response_format is not supported by this model"}}),
            (429, {"Retry-After": "1"}, {"error": {"message": "Rate limit exceeded: free-models-per-min"}}),
            reply("Here you go:\n```json\n" + json.dumps(FIXTURE) + "\n```"),
        ])
        check(code == 0 and not left, f"1: exit {code}, unused responses {len(left)}")
        check("response_format" in reqs[0]["body"] and "response_format" not in reqs[1]["body"], "1: JSON-mode fallback not applied")
        check(reqs[0]["auth"] == "Bearer test-key", "1: key not sent")
        check(any(p.get("type") == "image_url" for p in reqs[0]["body"]["messages"][1]["content"]), "1: crops not sent")
        doc = json.loads(out.read_text(encoding="utf-8"))
        check(doc["status"] == "draft" and doc["problems"] == [], f"1: draft has problems {doc['problems']}")
        check(doc["extracted_with"]["model"] == "test/vision:free", "1: model not recorded")
        check(doc["figures"][0]["source_size"] == [852, 1242], f"1: source size {doc['figures'][0]['source_size']}")

        # 2. Same crops again with --redo: served from cache, no request.
        code, reqs, _ = run(tmp, [], "--redo")
        check(code == 0 and len(reqs) == 0, f"2: expected a cache hit, made {len(reqs)} request(s)")

        # 3. A reviewed file is never overwritten without --force.
        doc["status"] = "reviewed"
        out.write_text(json.dumps(doc), encoding="utf-8")
        code, reqs, _ = run(tmp, [], "--redo")
        check(len(reqs) == 0 and json.loads(out.read_text())["status"] == "reviewed", "3: reviewed file was touched")

        # 4. Not JSON, then repaired on the second try; boxes in pixels get normalised and flagged.
        ex.CACHE = tmp / "cache2"
        pixel = json.loads(json.dumps(FIXTURE))
        pixel["figures"][0]["box"] = [80, 222, 760, 590]
        code, reqs, left = run(tmp, [reply("Sorry, the answer is below"), reply(json.dumps(pixel))], "--force")
        doc = json.loads(out.read_text(encoding="utf-8"))
        check(code == 0 and len(reqs) == 2 and not left, f"4: repair flow exit {code}, requests {len(reqs)}")
        expected = figure_fit.fit_box(ex.ROOT / doc["figures"][0]["source_image"].lstrip("/"), [80 / 852, 222 / 1242, 760 / 852, 590 / 1242])
        check(doc["figures"][0]["box"] == expected and any("fractions" in n for n in doc["notes"]), "4: pixel box not normalised/flagged")

        # 5. The daily cap stops the run cleanly without writing.
        ex.CACHE = tmp / "cache3"
        out.unlink()
        code, reqs, _ = run(tmp, [(429, {}, {"error": {"message": "Rate limit exceeded: free-models-per-day"}})])
        check(len(reqs) == 1 and not out.exists(), "5: daily limit did not stop the run")

    server.shutdown()

    # 6. Schema checks catch the mistakes review should see.
    good = ex.to_question_file("9702", {
        "id": QID, "image_paths": [f"/9702/9702-topic-12-motion-in-a-circle/assets/{QID}-p01.png",
                                   f"/9702/9702-topic-12-motion-in-a-circle/assets/{QID}-p02.png"], "marks": 10,
    }, FIXTURE, "fixture")
    check(good["problems"] == [], f"6: fixture has problems {good['problems']}")
    bad = json.loads(json.dumps(good))
    bad["parts"][0]["marks"] = 3
    bad["parts"][1]["text"] = bad["parts"][1]["text"].replace("[[fig:f1]]", "[[fig:f9]]")
    bad["parts"][2]["answer"] = None
    found = " | ".join(question_schema.problems(bad, 10))
    for expected in ("add up to 12", "[[fig:f9]] has no matching figure", "placed 0 times", "numeric part needs answer"):
        check(expected in found, f"6: schema missed '{expected}' in: {found}")

    # 7. Fitting: an edge through a label moves past it; separate text stays out;
    #    fitting twice changes nothing.
    im = Image.new("L", (400, 300), 255)
    d = ImageDraw.Draw(im)
    d.rectangle((20, 10, 380, 18), fill=0)       # a line of question text above
    d.ellipse((100, 60, 260, 220), outline=0)    # the figure
    d.rectangle((262, 130, 300, 140), fill=0)    # its label "52.2°", sticking out right
    d.rectangle((140, 222, 200, 228), fill=0)    # a value just under the figure
    mask = figure_fit.ink_mask(im)
    box = figure_fit.fit_box_px(mask, (98, 58, 280, 222))
    check(box[2] >= 300 and box[3] >= 228, f"7: label or value still cut off: {box}")
    check(box[1] > 18, f"7: box swallowed the text above: {box}")
    check(figure_fit.fit_box_px(mask, box) == box, "7: fitting is not idempotent")

    # 8. --refit-figures fixes boxes in written files and keeps their status.
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "9702" / "questions").mkdir(parents=True)
        doc = json.loads(json.dumps(good))
        doc["status"] = "reviewed"
        doc["figures"][0]["box"] = [0.3, 0.3, 0.5, 0.4]  # cuts through the figure
        path = tmp / "9702" / "questions" / f"{QID}.json"
        path.write_text(json.dumps(doc), encoding="utf-8")
        real_content, ex.CONTENT = ex.CONTENT, tmp
        try:
            ex.main(["--refit-figures"])
        finally:
            ex.CONTENT = real_content
        after = json.loads(path.read_text(encoding="utf-8"))
        b = after["figures"][0]["box"]
        check(after["status"] == "reviewed" and b != [0.3, 0.3, 0.5, 0.4] and b[0] < 0.3 and b[2] > 0.5, f"8: refit gave {b}, {after['status']}")

    if failures:
        print("\n".join(f"FAIL {f}" for f in failures))
        sys.exit(1)
    print("test_extract: OK")


if __name__ == "__main__":
    main()
