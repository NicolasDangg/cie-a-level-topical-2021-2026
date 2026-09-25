#!/usr/bin/env python3
"""Build the classic static pages from content/ JSON.

Classic mode is the original no-JavaScript view: {subject}/index.html plus
{subject}/{topic}/questions.html and answers.html. The markup and CSS are the
same as the old generators wrote; the only input is the exported content/.
Never opens a PDF or renders an image.
"""
from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
SUBJECTS = ("9702", "9618", "9990")

# Hand edits made to the live pages after they were generated. Kept exactly
# (typo included) until the site owner decides whether they stay.
OVERRIDES = {
    "index_topic_labels": {"9702-topic-14-temperature": "Temperature (+ Electric stuff))"},
    "index_answers_link": {"9990"},
}

# Remembers "classic" when a student arrives from the app's "Classic view" link
# (?view=classic). The key is shared with the app and the root index.html.
REMEMBER_SCRIPT = ("<script>try{if(new URLSearchParams(location.search).get('view')==='classic')"
                   "localStorage.setItem('tp:view','classic')}catch(e){}</script>")
SWITCH_CSS = """<style>
.view-switch { margin: 0 0 3mm; text-align: right; font-size: 9pt; }
.view-switch a { color: #4b5563; }
.framed .view-switch { display: none; }
@media print { .view-switch { display: none !important; } }
</style>"""


def question_css():
    return """<style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 10.5pt/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; }
h1 { font-size: 20pt; margin: 0 0 4mm; } h2 { font-size: 14pt; margin: 0 0 2mm; } h3 { font-size: 11.5pt; margin: 0 0 2mm; }
header { border-bottom: 1.5pt solid #17202a; padding-bottom: 4mm; margin-bottom: 6mm; }
.meta { color: #4b5563; font-size: 9pt; } .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(55mm, 1fr)); gap: 3mm; }
.card { border: .5pt solid #9ca3af; border-radius: 2mm; padding: 3mm; break-inside: avoid; } a { color: inherit; }
.question { padding-bottom: 2mm; }
.question + .question { page-break-before: always; break-before: page; }
.question-start { page-break-inside: avoid; break-inside: avoid; }
.question-head { display: flex; justify-content: space-between; gap: 4mm; border-bottom: .5pt solid #9ca3af; padding-bottom: 2mm; margin-bottom: 4mm; page-break-after: avoid; break-after: avoid-page; }
.question-layout { display: block; }
.answer-pane { display: none; }
.answer-link { white-space: nowrap; }
.answer-button { display: inline-block; margin-top: 2mm; padding: 1.5mm 3mm; border: .5pt solid #17202a; border-radius: 1.5mm; text-decoration: none; }
.crop { margin: 0 0 5mm; page-break-inside: avoid; break-inside: avoid; }
.crop img { display: block; max-width: 100%; max-height: 232mm; width: auto; height: auto; margin: 0 auto; border: .35pt solid #d1d5db; }
.note { color: #6b7280; font-size: 8.5pt; }
@media screen {
  body { max-width: 190mm; margin: 12mm auto; }
  body.answer-open { max-width: 380mm; }
  .question { margin-bottom: 12mm; }
  .crop img { width: 100%; max-height: none; }
  .question-layout.has-answer { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6mm; align-items: start; }
  .question-pane { min-width: 0; }
  .question-layout.has-answer .answer-pane { display: block; min-width: 0; position: sticky; top: 0; height: calc(100vh - 24mm); border-left: .5pt solid #9ca3af; padding-left: 6mm; }
  .answer-pane iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
}
@media print {
  .question-layout, .question-pane { display: block !important; }
  .answer-pane, .answer-link { display: none !important; }
}
</style>"""


def answer_css():
    return """<style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 10.5pt/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; }
h1 { font-size: 20pt; margin: 0 0 4mm; } h2 { font-size: 14pt; margin: 0 0 2mm; }
header { border-bottom: 1.5pt solid #17202a; padding-bottom: 4mm; margin-bottom: 6mm; }
.meta, .note { color: #4b5563; font-size: 9pt; } .question { padding-bottom: 2mm; }
.question[id] { scroll-margin-top: 12mm; }
.question + .question { page-break-before: always; break-before: page; }
.question-head { display: flex; justify-content: space-between; gap: 4mm; border-bottom: .5pt solid #9ca3af; padding-bottom: 2mm; margin-bottom: 4mm; page-break-after: avoid; break-after: avoid-page; }
.question-head + .answer-text { page-break-before: avoid; break-before: avoid-page; }
.answer-images { margin: 0 0 5mm; }
.answer-image { display: block; max-width: 100%; max-height: 245mm; width: auto; height: auto; margin: 0 auto 4mm; border: .35pt solid #d1d5db; page-break-inside: avoid; break-inside: avoid; }
.answer-text { white-space: pre-wrap; font: 9pt/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; border: .5pt solid #d1d5db; padding: 4mm; overflow-wrap: anywhere; }
@media screen { body { max-width: 190mm; margin: 12mm auto; } .question { margin-bottom: 12mm; } }
</style>"""


def split_view_script():
    return """<script>
function openAnswerSideBySide(link) {
  const layout = document.querySelector('.question-layout');
  const pane = document.getElementById('answer-pane');
  const frame = pane && pane.querySelector('iframe');
  if (!layout || !pane || !frame) return true;
  const questionId = new URL(link.href, document.baseURI).hash.slice(1);
  if (layout.dataset.answerId === questionId) {
    frame.removeAttribute('src');
    layout.classList.remove('has-answer');
    document.body.classList.remove('answer-open');
    layout.dataset.answerId = '';
    link.setAttribute('aria-expanded', 'false');
    link.textContent = 'View answer side by side';
    return false;
  }
  const activeLink = document.querySelector('.answer-link[aria-expanded="true"]');
  if (activeLink) {
    activeLink.setAttribute('aria-expanded', 'false');
    activeLink.textContent = 'View answer side by side';
  }
  frame.src = link.href;
  layout.classList.add('has-answer');
  document.body.classList.add('answer-open');
  layout.dataset.answerId = questionId;
  link.setAttribute('aria-expanded', 'true');
  link.textContent = 'Hide answer';
  const question = document.getElementById(questionId);
  if (question) question.scrollIntoView({block: 'start'});
  return false;
}
</script>"""


def filename(url):
    return url.rsplit("/", 1)[-1]


def switch_link(app_href, extra_script=""):
    return f"<p class='view-switch'><a href='{html.escape(app_href, quote=True)}'>Try the new view &#8594;</a></p>{extra_script}"


def questions_page(subject, subject_name, topic, questions, switch=True):
    label = topic["label"]
    title = f"{subject} {subject_name} — {label} — questions"
    head = [REMEMBER_SCRIPT, SWITCH_CSS] if switch else []
    body = [switch_link(f"/app/{subject}/{topic['slug']}")] if switch else []
    out = ["<!doctype html><html lang='en'><head><meta charset='utf-8'>", f"<title>{html.escape(title)}</title>", question_css(), split_view_script(), *head, "</head><body>", "<div class='question-layout'><main class='question-pane'>", *body]
    out.append(f"<header><h1>{html.escape(label)}</h1><div class='meta'>{subject} {html.escape(subject_name)} · A2 topical questions · {len(questions)} questions</div></header>")
    if not questions:
        out.append("<p class='note'>No captured questions are currently classified in this topic.</p>")
    for q in questions:
        marks = f" · {q['marks']} marks" if q.get("marks") else ""
        qid = html.escape(q["id"], quote=True)
        out.append(f"<article class='question' id='{qid}'>")
        out.append("<div class='question-start'>")
        out.append(f"<div class='question-head'><h2>{html.escape(q['id'])}</h2><div class='meta'>{html.escape(q['session'])} {q['year']} · Paper {q['variant']} · Question {q['question_number']}{marks} · <a class='answer-link' href='answers.html#{qid}' aria-controls='answer-pane' aria-expanded='false' onclick='return openAnswerSideBySide(this)'>View answer side by side</a></div></div>")
        images = q["image_paths"]
        if images:
            out.append(f"<figure class='crop'><img src='assets/{html.escape(filename(images[0]))}' alt='{html.escape(q['id'])} source crop'></figure>")
        out.append("</div>")
        for url in images[1:]:
            out.append(f"<figure class='crop'><img src='assets/{html.escape(filename(url))}' alt='{html.escape(q['id'])} source crop'></figure>")
        out.append(f"<div class='note'>Source pages: {', '.join(map(str, q['source_pages']))} · <a href='{html.escape(q['source_pdf_url'])}'>source PDF URL</a></div></article>")
    out.append("</main><aside class='answer-pane' id='answer-pane' aria-label='Matching answer'><iframe title='Matching answer'></iframe></aside></div></body></html>")
    return "\n".join(out)


def answers_page(subject, subject_name, topic, questions, switch=True):
    label = topic["label"]
    # Inside the questions page's side-by-side iframe the link is hidden; on its
    # own it opens the app with this question's mark scheme.
    framed = ("<script>if(window.self!==window.top)document.documentElement.className+=' framed';"
              "(function(){var a=document.querySelector('.view-switch a');"
              "if(a&&location.hash)a.href+='?answers='+location.hash.slice(1)})()</script>")
    head = [REMEMBER_SCRIPT, SWITCH_CSS] if switch else []
    body = [switch_link(f"/app/{subject}/{topic['slug']}", framed)] if switch else []
    out = [
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
        f"<title>{subject} {html.escape(label)} — answers</title>",
        answer_css(), *head, "</head><body>", *body,
        f"<header><h1>{html.escape(label)}</h1><div class='meta'>{subject} {html.escape(subject_name)} · official mark-scheme answers · {len(questions)} questions</div></header>",
    ]
    if not questions:
        out.append("<p class='note'>No answer entries are currently classified in this topic.</p>")
    for q in questions:
        a = q["answer"]
        out.append(f"<article class='question' id='{html.escape(q['id'], quote=True)}'>")
        marks = f" · {q['marks']} marks" if q.get("marks") is not None else ""
        out.append(f"<div class='question-head'><h2>{html.escape(q['id'])}</h2><div class='meta'>{html.escape(q['session'])} {q['year']} · Paper {q['variant']} · Question {q['question_number']}{marks}</div></div>")
        if a["status"] == "available":
            if a["image_paths"]:
                out.append("<div class='answer-images'>")
                for url in a["image_paths"]:
                    out.append(f"<img class='answer-image' src='{html.escape('../answer-assets/' + filename(url))}' alt='{html.escape(q['id'])} official mark scheme page'>")
                out.append("</div>")
            out.append(f"<div class='answer-text'>{html.escape(a['mark_scheme_text'])}</div>")
            out.append(f"<p class='note'>Official mark scheme pages: {', '.join(map(str, a['source_pages']))} · <a href='{html.escape(a['mark_scheme_url'])}'>source PDF URL</a></p>")
        else:
            out.append(f"<p class='note'>Official mark scheme unavailable after fallback search: {html.escape(a['reason'] or '')}</p>")
        out.append("</article>")
    out.append("</body></html>")
    return "\n".join(out)


def index_page(subject, index, switch=True):
    name = index["subject_name"]
    out = [
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
        f"<title>{subject} {name} topical collection</title>",
        question_css(),
        "<script>\n  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };\n</script>",
        '<script defer src="/_vercel/insights/script.js"></script>',
        *([REMEMBER_SCRIPT, SWITCH_CSS] if switch else []),
        "</head><body>",
        *([switch_link(f"/app/{subject}")] if switch else []),
    ]
    out.append(f"<header><h1>{subject} {html.escape(name)}</h1><div class='meta'>2021–2026 · A2 topical question crops · generated {index['generated']}</div></header>")
    out.append("<p>Questions are grouped by official A2 topic. Each entry links to printable question and answer files.</p><div class='grid'>")
    for t in index["topics"]:
        slug = t["slug"]
        label = OVERRIDES["index_topic_labels"].get(slug, t["label"])
        answers = f" · <a href='{slug}/answers.html'>answers</a>" if subject in OVERRIDES["index_answers_link"] else ""
        out.append(f"<div class='card'><h2><a href='{slug}/questions.html'>{html.escape(label)}</a></h2><div class='meta'>{t['question_count']} captured questions · <a href='{slug}/questions.html'>print questions</a>{answers}</div><a class='answer-button' href='{slug}/answers.html' target='_blank' rel='noopener'>Open answers separately</a></div>")
    out.append("</div><h2 style='margin-top:8mm'>Paper coverage</h2><div class='grid'>")
    for p in index["papers"]:
        out.append(f"<div class='card'><h3>{p['year']} {html.escape(p['session'])} · {p['variant']}</h3><div class='meta'>{p['question_count']} questions · <a href='{html.escape(p['source_pdf_url'])}'>source PDF</a></div></div>")
    out.append("</div>")
    if index["missing_papers"]:
        out.append("<h2 style='margin-top:8mm'>Unavailable requested papers</h2><ul>")
        for m in index["missing_papers"]:
            out.append(f"<li>{m['year']} {html.escape(m['session'])} · {m['variant']}: {html.escape(m['reason'])}</li>")
        out.append("</ul>")
    out.append("</body></html>")
    return "\n".join(out)


def build_subject(subject, out_root=ROOT, switch=True):
    index = json.loads((CONTENT / subject / "index.json").read_text(encoding="utf-8"))
    name = index["subject_name"]
    subject_dir = out_root / subject
    for topic in index["topics"]:
        data = json.loads((CONTENT / subject / "topics" / f"{topic['slug']}.json").read_text(encoding="utf-8"))
        topic_dir = subject_dir / topic["slug"]
        topic_dir.mkdir(parents=True, exist_ok=True)
        (topic_dir / "questions.html").write_text(questions_page(subject, name, topic, data["questions"], switch), encoding="utf-8")
        (topic_dir / "answers.html").write_text(answers_page(subject, name, topic, data["questions"], switch), encoding="utf-8")
    subject_dir.mkdir(parents=True, exist_ok=True)
    (subject_dir / "index.html").write_text(index_page(subject, index, switch), encoding="utf-8")
    return {"subject": subject, "topics": len(index["topics"])}


def main(out_root=ROOT, switch=True):
    results = [build_subject(subject, Path(out_root), switch) for subject in SUBJECTS]
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    main()
