# topicalpaper.me redesign plan

Read this whole file before starting. Work on ONE phase per session. At the end of each phase, stop, report what the phase asks for, and wait for review. Don't start the next phase on your own.

## Context

topicalpaper.me is a static site on Vercel serving CIE A-Level topical past-paper questions (9618 Computer Science, 9702 Physics, 9990 Psychology). Right now, Python scripts in `python files/` generate PNG question crops, `manifest.json`, `answers-manifest.json`, AND the HTML pages, with CSS and JS inlined into every page. Any UI change therefore means regenerating everything.

We're splitting the site into layers:

1. **Content pipeline (Python).** Runs only when new papers are added. PDFs in, PNGs + JSON out.
2. **Content (static files).** PNG crops and JSON. Permanent; rarely changes.
3. **Two views of the same content, both built from the JSON:**
   - **Classic** (`python files/build_classic_html.py`): the original static, no-JavaScript pages at their existing URLs (`/`, `/{subject}/index.html`, `/{subject}/{slug}/questions.html`, `answers.html`). For students who just want the cropped questions. Kept permanently, not replaced.
   - **App** (React + Vite + TypeScript, in `app/`): the redesign, served under `/app/`.

Students switch between the two with a link in each view's header. The choice is remembered on the device, so the home page opens in their preferred view.

**Subjects:** 9990 Psychology publishes only Clinical and Consumer Psychology (options 1 and 2). Health and Organisational were removed.

Question ids like `9618-2021-mj-31-q06` are the stable key everywhere. They start with digits, so never use a raw `querySelector('#...')` on them; use `getElementById` or `CSS.escape()`.

`supabase/` contains a not-yet-deployed grading edge function. `supabase/functions/grade/index.ts` defines the grading API contract (request body and response shape). Read it; don't modify or deploy anything in `supabase/`.

## Global constraints

- Never open PDFs or re-render images unless a phase explicitly says so. The existing PNGs are the content.
- Don't move, rename, or duplicate the existing PNG files in git (the repo is already large). Existing image URLs must keep working.
- Existing public URLs must keep working. They stay the classic pages; the app never takes them over.
- The public parts data for Practice mode must never contain mark-scheme text.
- Accessibility is required, not optional: keyboard operable, visible focus rings, WCAG AA contrast, `prefers-reduced-motion` respected.
- No console errors or warnings at the end of any phase.

---

## Phase 0: data export (Python only)

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

## Phase 1: design system + question card, in isolation

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

## Phase 2: full app with parity

### Routes (all under `/app`)

- `/app/`: home
- `/app/:subject`: subject index
- `/app/:subject/:topicSlug`: topic page
- `/app/:subject/:topicSlug?answers=<questionId>`: topic page with that question's answer panel open

### Layout

- **Top bar:** site name, then subject, then a topic breadcrumb. On the right: a segmented control reading "Browse | Practice", then a theme menu (light / dark / system, plus the dark-paper toggle).
- **Topic page:** a narrow left rail of filters (year, paper, session, and a "Hide duplicate variants" switch), a centre reading column about as wide as the crops, and the answer view as a right-hand panel that slides in. It's a component, not an iframe. On mobile the rail becomes a filter sheet and the answer panel becomes full-screen.
  - For "Hide duplicate variants": treat questions as duplicates when the same year, session, paper number, and question number exist across variants and their crop images are identical by content hash. Compute this in `export_data.py`, not in the browser, and add a `duplicate_of` field.
- **Subject index:** topic cards showing the question count and, once phase 3 exists, the student's progress.
- **Home:** subject cards, with the author credit and the "All credits to pastpapers.co" credit kept.
- Keep the Vercel analytics snippet from the current pages.

### Classic ↔ App switching

- The classic pages keep every existing URL. Nothing is deleted or rewritten.
- `vercel.json` adds only an SPA fallback: `/app/(.*)` → `/app/index.html`.
- Each view links to the equivalent page in the other: classic `questions.html` ↔ `/app/:subject/:slug`, classic `answers.html#id` ↔ `?answers=id`, classic `index.html` ↔ `/app/:subject`, `/` ↔ `/app/`.
- The chosen view is saved in localStorage under one shared key. The classic home page (`/`) runs a tiny inline script that sends students who chose the app to `/app/`. It must fail safe: with no storage or no JS, the student stays on classic. Following a "Classic view" link always lands on classic and saves that choice, so nobody gets stuck in a redirect loop.
- `build_classic_html.py` owns the classic markup, so the switch link is added there, not by hand.

### Done when

- Every classic page has an app equivalent showing the same questions in the same order.
- Every classic URL still serves the classic page, unchanged apart from the switch link.
- Printing a topic looks like today's printed version.
- `test_content.py` passes.
- There are no console errors.

**Report:** screenshots of one topic page (desktop, mobile, print preview) and the classic↔app switching verified, including the remembered choice.

---

## Phase 3: Practice mode with mock grader

### Mode

- "Browse" is the current behaviour. "Practice" shows answer areas.
- Mode persists in localStorage and can be set with `?mode=practice` (the URL wins over storage).
- In Practice mode, a question's answer panel is hidden until at least one of its parts has been graded. This is a study nudge, not security: the mark schemes are public elsewhere.

### Parts data

Create `content/9618/parts.json` in the shape `{ questionId: [{ partId, label, marks }] }`, with NO mark-scheme text.

- Hand-write entries for 9618 s21 paper 31, Q4, Q6 and Q9, by reading their crops.
- Questions without an entry show a quiet "Not available in Practice mode yet" note.
- Every 9702 and 9990 question shows that note.

### Grader adapter (the mock must be removable)

Files live in `src/grader/`:

| File | Role |
|---|---|
| `contract.ts` | Request and response types mirroring `supabase/functions/grade/index.ts`, plus `validateResponse()`, which throws on any shape mismatch. |
| `live.ts` | POSTs to `GRADER_URL` and maps HTTP errors to typed errors. |
| `mock.ts` | Mock implementation. Self-contained; imports only `contract.ts`. |
| `mock-data.ts` | Fake mark points for the mock. Never read from `parts.json`. |
| `index.ts` | The ONLY grader module the UI may import. Exports `gradePart({ partId, answer, earlierParts })` and picks the implementation from config. |

**Rules:**

- UI code never imports `mock.ts` or `live.ts` directly. Put a comment at the top of both saying so.
- `index.ts` loads the chosen implementation with dynamic `import()`, so the mock isn't downloaded in live mode.
- Both implementations pass every result through `validateResponse` before returning it.
- Both throw a `GraderError` with a `kind` of `rate_limited`, `verification`, `not_found`, `unavailable`, or `network`, plus `retryAfterSec` where relevant. The UI switches on `kind` only, never on HTTP status codes.
- `earlierParts` means the student's answers to previous parts of the same question, read from saved state.

**Config:**

- `GRADER_MODE` defaults to `"mock"`.
- Dev overrides: `?grader=mock|live` persists to localStorage; `?grader=reset` clears it.
- `?mock=rate_limited|verification|not_found|unavailable|network|slow` forces that mock error (or, for `slow`, a 5-second delay).

**Mock behaviour:**

- Wait about 600ms, then return results that are deterministic from the answer text.
- It must be able to produce every state: counted, missed, capped, blocked (with `blockedBy`), uncertain, and `provisional: true`.

### Error UI

Each error `kind` gets a clear inline message:

- `rate_limited` shows the retry time.
- Nothing ever leaves a spinner hanging.
- The answer text is never lost on error.

### State

- Save answers and results per `partId` in localStorage, so a refresh loses nothing.
- Add a "Clear my answers" control per question.
- Subject index topic cards show progress: questions attempted and total marks scored.

### Removal test

Explain exactly what it takes to delete the mock. It should be: delete `mock.ts` and `mock-data.ts`, and remove one branch in `index.ts`. If it takes more than that, fix the separation first.

**Report:** a screen recording or screenshots of answering all three questions through every grading and error state, the removal test result, and what's needed to switch to live grading.

---

## Later (not now)

- Deploy the Supabase grading function.
- Add the site's local and Vercel origins to its allowed origins.
- Switch `GRADER_MODE` to live.
- Build the preprocessing pipeline that produces part-level mark-scheme JSON.
