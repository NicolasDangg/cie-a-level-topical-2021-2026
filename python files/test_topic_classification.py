#!/usr/bin/env python3
"""Small regression check for topical assignments in the generated collection."""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

EXPECTED_MOVES = {
    **{qid: 12 for qid in (
        "9702-2023-mj-41-q02", "9702-2023-mj-43-q02",
    )},
    **{qid: 13 for qid in (
        "9702-2022-on-42-q01", "9702-2023-m-42-q01",
        "9702-2023-on-41-q01", "9702-2023-on-42-q02", "9702-2023-on-43-q01",
    )},
    **{qid: 15 for qid in (
        "9702-2022-on-42-q03", "9702-2023-mj-42-q02",
        "9702-2025-on-41-q04", "9702-2025-on-43-q04",
    )},
    **{qid: 18 for qid in (
        "9702-2022-on-41-q04", "9702-2022-on-43-q04",
        "9702-2025-mj-41-q02", "9702-2025-mj-43-q02",
    )},
    **{qid: 20 for qid in (
        "9702-2021-on-41-q09", "9702-2021-on-43-q09",
    )},
    **{qid: 21 for qid in (
        "9702-2023-on-41-q07", "9702-2023-on-43-q07",
        "9702-2024-mj-41-q07", "9702-2024-mj-43-q07",
    )},
    "9702-2022-mj-42-q08": 22,
    "9702-2025-m-42-q09": 23,
    **{qid: 24 for qid in (
        "9702-2022-m-42-q10", "9702-2023-m-42-q09",
    )},
}

EXPECTED_9618_MOVES = {
    **{qid: 13 for qid in (
        "9618-2021-mj-31-q02", "9618-2021-mj-32-q02", "9618-2021-mj-33-q02",
        "9618-2021-on-31-q03", "9618-2021-on-32-q03",
        "9618-2021-on-31-q05", "9618-2021-on-32-q05",
        "9618-2022-mj-31-q01", "9618-2022-mj-33-q01",
        "9618-2022-on-31-q03", "9618-2022-on-32-q04", "9618-2022-on-33-q03",
        "9618-2023-mj-31-q03", "9618-2023-mj-33-q03",
        "9618-2023-mj-31-q04", "9618-2023-mj-33-q04",
        "9618-2023-mj-32-q02",
        "9618-2023-on-31-q03", "9618-2023-on-32-q02", "9618-2023-on-32-q03", "9618-2023-on-33-q03",
        "9618-2023-on-31-q04", "9618-2023-on-33-q04",
        "9618-2024-mj-31-q03", "9618-2024-mj-32-q03", "9618-2024-mj-33-q03",
        "9618-2024-mj-31-q04", "9618-2024-mj-33-q04", "9618-2024-mj-32-q07",
        "9618-2024-on-31-q05", "9618-2024-on-33-q05",
        "9618-2024-on-31-q06", "9618-2024-on-33-q06",
        "9618-2024-on-32-q02", "9618-2024-on-32-q03",
        "9618-2025-mj-31-q01", "9618-2025-mj-32-q01", "9618-2025-mj-33-q01",
        "9618-2025-on-31-q01", "9618-2025-on-32-q01", "9618-2025-on-33-q01",
    )},
    **{qid: 15 for qid in (
        "9618-2023-mj-31-q08", "9618-2023-mj-33-q08",
        "9618-2024-mj-31-q11", "9618-2024-mj-32-q09", "9618-2024-mj-33-q11",
    )},
    **{qid: 16 for qid in (
        "9618-2023-on-31-q07", "9618-2023-on-33-q07",
    )},
    **{qid: 18 for qid in (
        "9618-2023-on-32-q08",
        "9618-2025-on-33-q08",
    )},
    **{qid: 19 for qid in (
        "9618-2023-on-32-q09",
        "9618-2024-on-31-q11", "9618-2024-on-32-q11", "9618-2024-on-33-q11",
    )},
    **{qid: 20 for qid in (
        "9618-2021-on-31-q02", "9618-2021-on-32-q02",
        "9618-2022-mj-32-q01", "9618-2022-mj-32-q02",
        "9618-2023-mj-31-q10", "9618-2023-mj-33-q10",
        "9618-2023-mj-32-q06",
        "9618-2023-on-31-q08", "9618-2023-on-33-q08",
        "9618-2023-on-31-q11", "9618-2023-on-33-q11",
        "9618-2023-on-32-q12",
        "9618-2024-on-31-q09", "9618-2024-on-33-q09",
        "9618-2025-mj-31-q12", "9618-2025-mj-32-q13", "9618-2025-mj-33-q11",
    )},
}


def main():
    records = json.loads((ROOT / "9702" / "manifest.json").read_text())["records"]
    by_id = {record["id"]: record for record in records}
    for qid, topic_number in EXPECTED_MOVES.items():
        assert qid in by_id, qid
        assert by_id[qid]["topic_number"] == topic_number, (
            qid, by_id[qid]["topic_number"], topic_number
        )

    topic12 = [r for r in records if r["topic_slug"] == "9702-topic-12-motion-in-a-circle"]
    motion_markers = ("centripetal", "circular motion", "angular velocity", "angular speed", "radian")
    non_motion_markers = (
        "amplitude modulation",
        "frequency modulation",
        "operational amplifier",
        "op-amp",
        "photoelectric",
        "work function",
        "ultraviolet",
    )
    assert topic12, "Physics topic 12 has no records"
    for record in topic12:
        text = record.get("text_excerpt", "").lower()
        assert any(marker in text for marker in motion_markers), record["id"]
        assert not any(marker in text for marker in non_motion_markers), record["id"]

    question_html = (ROOT / "9702" / "9702-topic-12-motion-in-a-circle" / "questions.html").read_text()
    answer_html = (ROOT / "9702" / "9702-topic-12-motion-in-a-circle" / "answers.html").read_text()
    for html in (question_html, answer_html):
        assert "page-break-after: always" not in html
        assert ".question + .question" in html
        assert "break-after: avoid-page" in html
    assert question_html.count("class='question-start'") == len(topic12)

    cs_records = json.loads((ROOT / "9618" / "manifest.json").read_text())["records"]
    cs_by_id = {record["id"]: record for record in cs_records}
    assert len(cs_records) == 407
    for qid, topic_number in EXPECTED_9618_MOVES.items():
        assert qid in cs_by_id, qid
        assert cs_by_id[qid]["topic_number"] == topic_number, (
            qid, cs_by_id[qid]["topic_number"], topic_number
        )


if __name__ == "__main__":
    main()
