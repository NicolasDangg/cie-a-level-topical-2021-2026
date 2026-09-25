# topicalpaper.me redesign plan

Read this whole file before starting. Work on ONE phase per session. At the end of each phase, stop, report what the phase asks for, and wait for review. Don't start the next phase on your own.

## Context

topicalpaper.me is a static site on Vercel serving CIE A-Level topical past-paper questions (9618 Computer Science, 9702 Physics, 9990 Psychology). Right now, Python scripts in `python files/` generate PNG question crops, `manifest.json`, `answers-manifest.json`, AND the HTML pages, with CSS and JS inlined into every page. Any UI change therefore means regenerating everything.

We're splitting the site into layers:

1. **Content pipeline (Python).** Runs only when new papers are added. PDFs in, PNGs + JSON out.
2. **Content (static files).** PNG crops and JSON. Permanent; rarely changes.
3. **Two views of the same content, both built from the JSON:**
   - **Classic** (`python files/build_classic_html.py`): the original static, no-JavaScript pages at their existing URLs (`/`, `/{subject}/index.html`, `/{subject}/{slug}/questions.html`, `answers.html`). For students who just want the cropped questions. Kept permanently, not replaced.
   - **App** (React + Vite + TypeScript, source in `web/`): the redesign, served under `/app/`. Its headline feature is **practice sets**: pick a topic, get a random set of questions, answer them as text in a split-screen test view, get marked. The approved mockups are the design canvas "Topical practice sets" (set picker, answering screen, phone view, results).

Students switch between the two with a link in each view's header. The choice is remembered on the device, so the home page opens in their preferred view.

**Subjects:** 9990 Psychology publishes only Clinical and Consumer Psychology (options 1 and 2). Health and Organisational were removed.

Question ids like `9618-2021-mj-31-q06` are the stable key everywhere. They start with digits, so never use a raw `querySelector('#...')` on them; use `getElementById` or `CSS.escape()`.

The grading API contract will live in `supabase/functions/grade/index.ts` (a not-yet-deployed edge function; request body and response shape). It is not in the repo yet and must be added before Phase 5. Once it is: read it; don't modify or deploy anything in `supabase/`.

## Global constraints

- Never open PDFs or re-render images unless a phase explicitly says so. The existing PNGs are the content.
- Don't move, rename, or duplicate the existing PNG files in git (the repo is already large). Existing image URLs must keep working.
- Existing public URLs must keep working. They stay the classic pages; the app never takes them over.
- Question data served to the browser (topic JSON aside) must never contain mark-scheme text. Extracted questions and part-level mark schemes live in separate files.
- Accessibility is required, not optional: keyboard operable, visible focus rings, WCAG AA contrast, `prefers-reduced-motion` respected.
- No console errors or warnings at the end of any phase.

---

## Phase 0: data export (Python only) — done

1. Replace the hardcoded `ROOT` path in every file in `python files/` with a path derived from `__file__`.
2. Write `python files/export_data.py`. It reads the EXISTING `manifest.json` and `answers-manifest.json` for all three subjects and writes:
   - `content/{subject}/index.json`: subject code and name, topics (number, label, slug, question count), papers, and missing papers.
   - `content/{subject}/topics/{slug}.json`: that topic's questions, in the current order. For each question: id, year, session, session code, paper, variant, question number, marks, image paths, source pages, source PDF URL, and answer info (status, answer image paths, mark-scheme source URL, mark-scheme text).
   - Omit `text_excerpt`. Put a `"schema": "topicalpaper-content/v2"` field in every file.
   - It must not open any PDF or render any image. Reuse the existing PNG paths exactly.
3. Write `python files/test_content.py`, and port the useful checks from `test_answer_links.py` into it. It must check that:
   - every JSON file parses and has the schema field
   - every referenced PNG exists on disk
   - every question has an answer entry
   - question counts match the source manifests.
4. Remove all HTML writing from both generators. Keep their PNG and manifest generation working, and have `generate_question_assets.py` call the export at the end.
5. Don't delete the existing generated HTML files. They become Classic mode.
6. (Added) `python files/build_classic_html.py` regenerates the classic pages from `content/`, byte-identical to the old generators' output. `generate_answers.py` calls it after the export.

**Report:** a diff summary, the `test_content.py` output, and the size of the largest topic JSON file.

---

## Phase 1: design system + question card, in isolation — done

Build the app scaffold and ONE component, the question card, to a finished standard before building any pages. It's 90% of what users see.

### Stack

- Vite + React + TypeScript + React Router.
- Tailwind v4, with design tokens as CSS variables (so light and dark mode are two sets of values).
- Radix primitives (unstyled) for the mode toggle, dialogs, and tooltips.
- `lucide-react` for icons.
- Fonts self-hosted via `@fontsource`: IBM Plex Sans, IBM Plex Mono, Source Serif 4.
- No UI kit, no component library styling.

### Serving content

The app lives in `app/` and is served under `/app/`. It must not change what the classic URLs serve. Decide how the app serves the existing subject folders' PNGs and the new `content/` JSON at their current URL paths without importing them into the JS bundle and without duplicating them in git. Explain the approach you chose and its build-time cost before implementing it.

### Design direction: "paper on a desk"

Students spend long, focused sessions here reading scanned exam papers. The UI should recede; the question crops are the hero. Avoid anything that looks like a generic SaaS or AI-generated template: no gradients, no glassmorphism, no Inter-plus-default-Tailwind look.

**Tokens (light):**

```css
--color-desk: #F6F5F1;      /* page background, warm off-white */
--color-paper: #FFFFFF;     /* question sheets */
--color-ink: #1C1B19;       /* primary text */
--color-ink-muted: #6B6862; /* secondary text */
--color-rule: #E4E1DA;      /* hairlines, borders */
--color-mark: #C2410C;      /* "examiner ink": ticks and scores */
```

- **Dark mode:** a dark warm-gray desk and matching tokens. Choose the values yourself; they must pass AA contrast.
- **Crops:** each crop is a white "sheet" with a hairline border and a very soft shadow, sitting on the desk colour.
- **Dark mode crops:** by default, keep them as paper sheets dimmed with `filter: brightness(0.85)`. Add a user toggle, "Dark paper", that applies `filter: invert(1) hue-rotate(180deg)` to crops. Persist it.
- **Typography:**
  - UI text: IBM Plex Sans.
  - Question ids, mark counts like `[4]`, paper codes, and other metadata: IBM Plex Mono.
  - Topic and page titles: Source Serif 4.
- **Motion:** minimal. Panels slide in, and the score counts up once after grading. Everything is disabled under `prefers-reduced-motion`.

### Question card spec

**Header row:** the question id (mono), then session, year, paper, and question number, the total marks, and an "Answer" control.

**Body:** the crop images, stacked.

**Practice mode:** below each part, an answer area (styled to feel like a paper's answer lines, but still clearly a text input), a submit button, and space in the right-hand margin for the score.

**Grading states,** borrowing the examiner's red-pen metaphor:

| State | Treatment |
|---|---|
| Counted | Tick in `--color-mark` ink |
| Awarded but capped | Struck-through tick, with the note "correct, but the marks for this were already used up" |
| Awarded but blocked | Tick with the note "needs <point> first" |
| Uncertain | Dashed outline, labelled "borderline" |
| Missed | Neutral gray, NEVER red |

The part score shows in the margin in `--color-mark`. If the result is provisional, add a small note that borderline points weren't counted. Every state must be distinguishable without colour.

**Must render correctly in:**

- Browse and Practice modes
- every grading state
- loading and each error state
- light, dark, and dark-paper themes
- a 375px mobile width (wide crops scale down; nothing overflows)
- print: A4, one question per page, all controls, answer boxes, and panels hidden, looking like today's printed pages.

Build a dev-only route, `/dev/card`, that shows the card in every one of these states side by side, using fixture data.

**Report:** screenshots of `/dev/card` in light, dark, and dark-paper themes, at mobile width, and in print preview.

---

## Decisions (from the practice-set design review)

- **Extract once, in the pipeline.** A vision model turns each question's crops into structured text ahead of time; a person reviews it; it ships as static JSON. Never call a model per student session.
- **Sets are sized by a question slider** capped at the topic's distinct questions (variants that repeat a question count once), default 5, showing a live "≈ N marks · about M min" estimate at 1.2 min per mark.
- **Questions show as text plus cropped figures**, with a "Original scan" toggle back to the existing crops. The scan is also the fallback when extraction is wrong.
- **Students choose the marking style** per set: Practice (check each part as you go; the mark scheme opens after checking) or Test (timer, flag for review, everything marked on submit).
- **Test mode grades on submit**, all parts in parallel with visible progress. Not graded silently while typing (answers still change, so that would pay for grading twice).
- **Results split marks by part kind** (calculations vs definitions and explanations), which the extraction tags.
- **Progress stays on the device** (localStorage) for now. Accounts and sync are later.
- **Extraction uses free vision models on OpenRouter**, configured by `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (see `.env.example`, read by `python files/llm_config.py`). The key lives where the pipeline runs (a git-ignored `.env`, or the Claude Code environment's secrets), not in Vercel: extraction never runs on Vercel. A Vercel env var is only needed later if grading runs as a Vercel function, and then server-side only (never `VITE_`-prefixed).
- **`_source-pdfs/` and `python files/` stay publicly served**, as today.

---

## Phase 2: app shell, duplicates, and the cut-over — done

### Duplicates (Python)

- In `export_data.py`, add `duplicate_of` to each question: the id of the first question with the same year, session, paper number and question number in another variant whose crops match. Crops differ in the footer line (paper code), so compare the crop images with the bottom footer strip removed (read the PNG pixels; never re-render from PDF), not raw file bytes.
- `test_content.py` checks that `duplicate_of` always points at an earlier existing question in the same topic, and prints the duplicate count per topic.

### Routes (all under `/app`)

- `/app/`: home
- `/app/:subject`: subject index
- `/app/:subject/:topicSlug`: topic page (Browse)
- `/app/:subject/:topicSlug?answers=<questionId>`: topic page with that question's answer panel open

### Layout

- **Top bar:** site name, then subject, then a topic breadcrumb. On the right: a "Practice sets" link, a theme menu (light / dark / system, plus the dark-paper toggle), and the "Classic view" link.
- **Topic page (Browse):** a narrow left rail of filters (year, paper, session, "Hide duplicate variants", on by default), a centre reading column of question cards, and the answer view as a right-hand panel that slides in. It's a component, not an iframe. On mobile the rail becomes a filter sheet and the answer panel becomes full-screen. Each topic page also offers "Practice this topic", which opens the set picker with the topic chosen.
- **Subject index:** topic cards showing the question count (and progress once sets exist).
- **Home:** subject cards, with the author credit and the "All credits to pastpapers.co" credit kept.
- Keep the Vercel analytics snippet from the current pages.

### Classic ↔ App switching

- The classic pages keep every existing URL. Nothing is deleted or rewritten.
- Vercel builds `web/` (`npm run build`) and serves `web/site/` as the output directory. `vercel.json` adds only an SPA fallback: `/app/(.*)` → `/app/index.html`. Confirm hard links work on Vercel's builder; the copy fallback is acceptable if not.
- Each view links to the equivalent page in the other: classic `questions.html` ↔ `/app/:subject/:slug`, classic `answers.html#id` ↔ `?answers=id`, classic `index.html` ↔ `/app/:subject`, `/` ↔ `/app/`.
- The chosen view is saved in localStorage under one shared key. The classic home page (`/`) runs a tiny inline script that sends students who chose the app to `/app/`. It must fail safe: with no storage or no JS, the student stays on classic. Following a "Classic view" link always lands on classic and saves that choice, so nobody gets stuck in a redirect loop.
- `build_classic_html.py` owns the classic markup, so the switch link is added there, not by hand.

### Done when

- Every classic page has an app equivalent showing the same questions in the same order.
- Every classic URL still serves the classic page, unchanged apart from the switch link.
- Printing a topic looks like today's printed version.
- `test_content.py` passes, including the duplicate checks.
- There are no console errors.

**Report:** screenshots of one topic page (desktop, mobile, print preview), the classic↔app switching verified including the remembered choice, and duplicate counts per topic.

---

## Phase 3: question extraction (pipeline + review) — built; pilot 1 reviewed, pilot 2 next

Turn each distinct question's existing crops into structured, reviewed text. Reads the PNG crops only; never opens a PDF, and creates no new image files.

### Output

One file per **distinct** question (repeats reuse their original), `content/{subject}/questions/{questionId}.json`, schema `"topicalpaper-question/v1"`, defined and checked by `python files/question_schema.py`:

- `id`, `status` (`draft` | `reviewed` | `rejected`), `extracted_with` (model, prompt version, date), `source_images`, `marks_total`, `stem` (text before part (a), or null)
- `parts`: in order, each with `partId` (`a`, `c-ii`), `label` (`(c)(ii)`), `lead` (text shared by a group of sub-parts, on the first of them), `text`, `marks`, `kind` (`numeric` | `written` | `diagram` | `code`), for numeric parts `answer: { symbol, unit }` (symbol null when the answer line has no "x ="), and for written or code parts whose answer space is split into labelled spaces `slots` (`["Benefit 1", "Drawback 1", …]`, else null; Phase 4 gives each its own box). A question with no lettered parts is one part, `partId` `main`, empty label.
- `figures`: `{ id, caption, alt, source_image, source_size, box }`. A figure is a box (fractions of the image) on an existing crop; the app shows it by clipping that image, so there are no figure files and a wrong box is fixed by editing four numbers. Model boxes are then fitted to the pixels (`python files/figure_fit.py`): an edge that cuts through ink moves out until it clears the label, and blank margins are trimmed to a small pad. Blank pages (the paper's trailing "BLANK PAGE"s, attached to 93 last questions) are never sent to the model. `extract_questions.py --refit` re-applies this to written files without model calls, and `/dev/review` lets a reviewer drag a box or its edges on the scan.
- `notes` (the model's uncertainties) and `problems` (validator output, recomputed on every save).
- Text format: paragraphs, `*italic*`, `` `code` ``, `$TeX$` (rendered with KaTeX), fenced code blocks, `[[fig:ID]]` placing a figure, and `[[blank]]` for a gap the student fills in inside a sentence or a line of code ("IF [[blank]] THEN"; alone on a line, a whole missing line). Nothing else is interpreted. Checks that may be fine (code to complete with no blanks) are `warnings`: shown in review, never blocking.
- No mark-scheme text, ever. The extractor is only ever shown question crops.

### Extractor (`python files/extract_questions.py`)

- `--pilot`, `--subject`, `--topic`, `--ids`, `--limit`, `--dry-run` (no key needed), `--redo` (re-extract drafts), `--force` (also reviewed/rejected).
- OpenRouter chat completions with the crops as images; settings from `llm_config.py`. Falls back when a model rejects JSON mode, repairs one non-JSON reply, paces requests (`--min-interval`, default 4 s), honours `Retry-After`, stops cleanly at the daily free cap so a later run resumes, and caches every reply by model + prompt + crop bytes (`python files/.cache/extract/`, git-ignored).
- Tested offline against a fake OpenRouter server: `python files/test_extract.py`.
- Scale: 878 distinct questions (pilot: 11). One request each plus occasional retries.

### Validation

`question_schema.py` checks: part marks sum to the question's marks, part ids and labels, kinds, numeric answers, figure boxes, every figure placed exactly once, balanced TeX and code fences. `test_content.py` requires reviewed files to have no problems and drafts to record their problems honestly; `export_data.py` never touches `questions/`.

### Review tool (dev server only)

`/app/dev/review/:subject/:topicSlug`: each question's scan beside its rendered extraction, with problems and model notes. Keys: J/K next/previous, A approve, R reject, D back to draft, E edit the JSON. Saves go through a dev-server endpoint that re-runs the validator; a question with problems can't be approved. Browser test: `web/scripts/check-review.mjs`.

### Remaining

Run the pilot with a real key and model: `python3 "python files/extract_questions.py" --pilot`, review the 11 drafts, and report accuracy (what needed editing) before extracting everything.

---

## Phase 4: practice sets (no grading yet) — built

Built in `web/src/practice/`: `/app/practice` (picker), `/app/practice/set` (answering), `/app/practice/results` (self-marking). Which questions a set may use comes from `content/{subject}/practice.json`, generated from the question files (live in dev, at build for deploys), so approving questions in the review tool is all it takes to add them. Tested by `npm run check:practice`. Notes from building it:

- Gaps are inputs in the question itself; slots, numeric answer lines and working get their own fields; the symbol bar inserts at the caret of the last field used.
- A diagram part draws on its figure (by caption reference, else the last figure placed in its text: for "the array is … complete the trace table", the trace table). Tools: pen, straight line, smooth curve, eraser, undo/redo, clear. Other parts' marks on the same figure show faintly.
- Results stack the mark scheme under the answers at full width: side by side it was too small to read. Self-marks give the score and "Where the marks went" by part kind.
- Trace tables are drawn on for now; typed cells (grid found from the scan's pixels) are the next improvement.

Build the three screens from the approved mockups: set picker, answering screen (desktop split view and phone tabs), results.

- **Picker** (`/app/practice`, topic preselectable): subject tabs, topic cards with counts, question slider (1 to the topic's distinct `reviewed` questions, default 5) with the live marks/time estimate, Practice/Test choice, and "Prefer questions I haven't answered yet".
- **Drawing a set:** random, without repeats, skipping `duplicate_of` questions and anything not `reviewed`. The set's question ids go in the URL (`/app/practice/set?q=…&mode=test`), so a refresh or a shared link reopens the same set.
- **Answering:** question text with figures and the Text/Original scan toggle (the scan view reuses the Phase 1 crop sheet); one answer area per part (lined box for written parts; working box plus a final-answer field with the unit for numeric parts); each `[[blank]]` an inline input in place (in code, a monospace input sized to the gap) and each of a part's `slots` its own labelled box; for diagram parts, a drawing layer over the figure the part names ("On Fig. 1.2, draw…", matched to the figure's caption, else the figure named in its group's lead): straight line, smooth curve through points, freehand pen, eraser, undo/redo, kept per part on the device, the figure's blank space being the drawing area; "complete the table" parts get an editable table instead (to design once trace tables are extracted); clicking a part on either side highlights it on the other; question navigator (answered / not started / flagged), Flag for review, Back/Next; Test mode timer (hideable); phone: Question/Answer tabs and a symbol bar (×10ⁿ, π, ω, ², √).
- **Saving:** every answer autosaves per `partId` to localStorage; nothing is lost on refresh.
- **Results without a grader:** after submit, each part shows the student's answer beside that part's official mark scheme (the existing mark-scheme page images) so they can self-mark. Phase 5 replaces this with automatic marking.

**Report:** screenshots of every screen at desktop and phone width in light and dark, and a full set answered end to end.

---

## Phase 5: grading

### Part-level mark schemes

- Extend the extractor to split each question's mark scheme into parts (`content/{subject}/markschemes/{questionId}.json`, separate from the question files), reviewed the same way. The grader reads these; the browser never receives them before grading.

### Grader adapter (the mock must be removable)

Files live in `src/grader/`:

| File | Role |
|---|---|
| `contract.ts` | Request and response types mirroring `supabase/functions/grade/index.ts`, plus `validateResponse()`, which throws on any shape mismatch. |
| `live.ts` | POSTs to `GRADER_URL` and maps HTTP errors to typed errors. |
| `mock.ts` | Mock implementation. Self-contained; imports only `contract.ts`. |
| `mock-data.ts` | Fake mark points for the mock. |
| `index.ts` | The ONLY grader module the UI may import. Exports `gradePart({ partId, answer, earlierParts })` and picks the implementation from config. |

**Rules:**

- UI code never imports `mock.ts` or `live.ts` directly. Put a comment at the top of both saying so.
- `index.ts` loads the chosen implementation with dynamic `import()`, so the mock isn't downloaded in live mode.
- Both implementations pass every result through `validateResponse` before returning it.
- Both throw a `GraderError` with a `kind` of `rate_limited`, `verification`, `not_found`, `unavailable`, or `network`, plus `retryAfterSec` where relevant. The UI switches on `kind` only, never on HTTP status codes.
- `earlierParts` means the student's answers to previous parts of the same question.
- The adapter's results map into the Phase 1 card view types (`src/components/question-card/types.ts`), so every grading state already has a design.

**Config:** `GRADER_MODE` defaults to `"mock"`; dev overrides `?grader=mock|live` (persisted; `?grader=reset` clears) and `?mock=rate_limited|verification|not_found|unavailable|network|slow`. The mock waits about 600ms, is deterministic from the answer text, and can produce every state: counted, missed, capped, blocked (with `blockedBy`), uncertain, `provisional: true`.

### Marking in the two modes

- **Practice:** "Check answer" per part; the mark scheme for a question opens once one of its parts has been checked.
- **Test:** on submit, every part is graded in parallel with a visible progress count; parts that fail keep their answers and can be retried individually from the results page.
- Errors: each `kind` gets a clear inline message; `rate_limited` shows the retry time; nothing leaves a spinner hanging; answer text is never lost.

### Results

- Score, per-question mark squares, per-part breakdown, the calculations vs explanations split, "Retry the lowest questions", "New set from this topic". Subject index topic cards show progress (questions attempted, marks scored).

### Removal test

Explain exactly what it takes to delete the mock. It should be: delete `mock.ts` and `mock-data.ts`, and remove one branch in `index.ts`. If it takes more than that, fix the separation first.

**Report:** screenshots of a set marked in both modes through every grading and error state, the removal test result, and what's needed to switch to live grading.

---

## Later (not now)

- Deploy the Supabase grading function (`supabase/` must be added to the repo before Phase 5).
- Add the site's local and Vercel origins to its allowed origins.
- Switch `GRADER_MODE` to live.
- Accounts, so progress and "questions I haven't answered" follow a student across devices.
- Fix the pipeline's crop bounds (trailing blank space, clipped footer line).
