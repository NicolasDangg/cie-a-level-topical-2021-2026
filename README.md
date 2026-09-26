# CIE A-Level topical past papers, 2021–2026

Cambridge International A-Level past-paper questions, cut out of the papers and
sorted by topic, with the official mark scheme beside each one. Live at
[topicalpaper.me](https://topicalpaper.me).

| Subject | Papers | Questions |
| --- | --- | --- |
| 9702 Physics | 70 | 436 |
| 9618 Computer Science | 58 | 407 |
| 9990 Psychology (Clinical and Consumer options) | 64 | 376 |

A2 topics only. 2026 sessions are listed as unavailable until they are published.

Past papers retrieved from [pastpapers.co](https://pastpapers.co) with
[pastpaper-retrieve-aslevel](https://github.com/NicolasDangg/pastpaper-retrieve-aslevel).
Question papers and mark schemes are © UCLES.

## Two ways to read it

- **Classic view** (`/`, `/{subject}/…`): static pages with no JavaScript. Each
  topic has a `questions.html` of cropped questions and an `answers.html` of
  mark-scheme crops. They print cleanly on A4, one question per page.
- **App** (`/app/`): a React app built from the same content. It adds filters,
  hides repeated paper variants, and opens the mark scheme in a side panel.
  **Practice sets** draw random questions from a topic, show them as text to
  answer on screen, and mark them in Practice or Test mode.

Each view links to the same page in the other, and the home page remembers
which one you picked.

## Repository layout

```
9702/ 9618/ 9990/     Classic pages, question and answer PNG crops, manifests
content/{subject}/    JSON the app reads (index, topics, extracted questions)
python files/         Content pipeline: crops, manifests, export, extraction
web/                  The app (Vite, React, TypeScript, Tailwind)
index.html            Classic home page
vercel.json           Build and routing for Vercel
REDESIGN_PLAN.md      The redesign plan, phase by phase
```

## Content pipeline

The pipeline runs only when new papers are added. PDFs go in; PNG crops and
JSON come out. Existing image paths never change, so old links keep working.

```sh
# Crop questions from the question papers and write each subject's manifest.json.
# Ends by exporting content/ JSON.
python3 "python files/generate_question_assets.py"

# Crop mark-scheme pages, write answers-manifest.json, re-export, and rebuild
# the classic pages.
python3 "python files/generate_answers.py"

# Re-export content/ JSON from the manifests (never opens a PDF).
python3 "python files/export_data.py"

# Rebuild the classic pages from content/.
python3 "python files/build_classic_html.py"

# Check the JSON, the PNGs it points to, and question counts.
python3 "python files/test_content.py"
```

### Question extraction

For practice sets, a vision model turns each question's crops into
structured text once, ahead of time. A person reviews it before it ships.
Nothing calls a model while a student uses the site.

```sh
cp .env.example .env   # add OPENROUTER_API_KEY and OPENROUTER_MODEL
python3 "python files/extract_questions.py" --pilot --dry-run
python3 "python files/extract_questions.py" --subject 9702 --topic 9702-topic-12-motion-in-a-circle
```

Output goes to `content/{subject}/questions/{id}.json` as drafts. Review them in
the dev server at `/app/dev/review/:subject/:topic`. The format and its checks
are in `python files/question_schema.py`. Question files never contain
mark-scheme text.

## The app

```sh
cd web
npm install
npm run dev          # http://localhost:5173/app/
npm run build        # typecheck, build, and assemble the full site in web/site/
npm run serve:site   # serve web/site/ the way Vercel does
```

The app never bundles content. It fetches the JSON and PNGs from their real
URLs. See [web/README.md](web/README.md) for how that works and for the test
scripts.

## Deploying

Vercel runs `npm run build` in `web/` and serves `web/site/`. That folder holds
the classic pages at their original URLs, with the app under `/app/`.
`vercel.json` sends any other `/app/...` path to the app.

## Credits

Made by Phuc Nguyen (Nicolas) Dangg, an A-Level student.
