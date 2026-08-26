"""Regression checks for generated question-to-answer links."""
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path("/Users/nicolasdangg/Documents/past paper/cie-a-level-topical-2021-2026")


class QuestionParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.questions = []
        self.current = None
        self.in_h2 = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "article" and "question" in attrs.get("class", "").split():
            self.current = {"id": None, "links": []}
            self.questions.append(self.current)
        elif self.current and tag == "h2":
            self.in_h2 = True
        elif self.current and tag == "a" and "answer-link" in attrs.get("class", "").split():
            self.current["links"].append(attrs.get("href", ""))

    def handle_endtag(self, tag):
        if tag == "h2":
            self.in_h2 = False

    def handle_data(self, data):
        if self.current and self.in_h2:
            self.current["id"] = (self.current["id"] or "") + data


class AnswerIdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        if tag == "article":
            attrs = dict(attrs)
            if "question" in attrs.get("class", "").split() and attrs.get("id"):
                self.ids.add(attrs["id"])


def main():
    manifest = json.loads((ROOT / "9702" / "manifest.json").read_text())
    answers = json.loads((ROOT / "9702" / "answers-manifest.json").read_text())
    assert len(manifest["records"]) == 436
    assert len(answers["records"]) == 436

    expected = {record["id"]: record for record in manifest["records"]}
    expected_answers = {record["id"]: record for record in answers["records"]}
    found = {}
    for topic in manifest["topics"]:
        question_path = ROOT / "9702" / topic["questions_html"]
        parser = QuestionParser()
        parser.feed(question_path.read_text())
        for question in parser.questions:
            assert question["id"] in expected, question["id"]
            assert expected[question["id"]]["topic_slug"] == topic["slug"]
            assert expected_answers[question["id"]]["html"] == topic["answers_html"]
            assert len(question["links"]) == 1, question["id"]
            href = question["links"][0]
            parsed = urlsplit(href)
            assert parsed.path == "answers.html", (question["id"], href)
            assert unquote(parsed.fragment) == question["id"], (question["id"], href)
            assert (question_path.parent / parsed.path).is_file(), href
            found[question["id"]] = (question_path.parent / parsed.path, parsed.fragment)

    assert set(found) == set(expected)
    for answer_path, fragment in found.values():
        parser = AnswerIdParser()
        parser.feed(answer_path.read_text())
        assert fragment in parser.ids, (answer_path, fragment)

    for topic in manifest["topics"]:
        question_text = (ROOT / "9702" / topic["questions_html"]).read_text()
        assert ".question-layout.has-answer" in question_text
        assert "@media print" in question_text
        assert "if (layout.dataset.answerId === questionId)" in question_text
        assert "frame.removeAttribute('src')" in question_text
        assert "layout.classList.remove('has-answer')" in question_text
        assert "document.body.classList.remove('answer-open')" in question_text
        assert "link.textContent = 'Hide answer'" in question_text
        assert "link.textContent = 'View answer side by side'" in question_text


if __name__ == "__main__":
    main()
