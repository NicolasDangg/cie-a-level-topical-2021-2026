# topicalpaper.me app

The redesigned view, served under `/app/`. The classic static pages keep every
other URL (see `REDESIGN_PLAN.md`).

```sh
npm install
npm run dev          # http://localhost:5173/app/  (dev card: /app/dev/card)
npm run build        # typecheck, build to site/app, assemble site/
npm run serve:site   # serve site/ like Vercel does (http://localhost:4174)
npm run check:site -- <outDir>           # end-to-end checks of site/ (after build)
npm run screenshots -- <outDir> [path]   # card checks; needs `npm run dev` running
```

## How content is served

The app never imports content. It fetches the JSON and loads the PNGs at
their real site URLs: `/content/{subject}/...` and `/{subject}/.../*.png`.
Nothing is copied into git or the JS bundle.

- **Dev and preview:** `build/repo-content.ts` is a Vite middleware that serves
  those paths straight from the repo root. It only serves `.json` and `.png`
  files, and refuses paths that escape the root.
- **Production:** `vite build` writes the app to `site/app/`. Then
  `scripts/assemble-site.mjs` hard-links every published repo file into
  `site/` at its current path, so classic pages, crops and JSON keep their
  URLs next to the app. Hard links take no extra disk. It falls back to
  copying if the filesystem refuses them.
- **Build-time cost** (measured): the whole `npm run build` takes about 3.4 s.
  Assembly links 5,529 files (885 MB) in about 80 ms. Copying instead would
  write the full 885 MB on every build. Vercel only uploads files whose
  content hash changed, so unchanged PNGs aren't re-uploaded.

Vercel builds this way too (`vercel.json` at the repo root): it runs
`npm run build` in `web/`, serves `web/site/`, and sends any `/app/...` path
that isn't a real file to the app. The source folder is `web/`, not `app/`,
so it can never shadow the built app at `/app/`.

`/dev/card` is built into Vercel **preview** deployments (`VERCEL_ENV=preview`)
for review, and left out of production.

## Layout

- `src/styles.css`: design tokens (`--color-desk`, `--color-paper`, …), with
  dark mode and dark paper as alternate values of the same variables. Also
  holds the print rules.
- `src/theme/`: light / dark / system preference and the "Dark paper" toggle,
  stored in localStorage (`tp:theme`, `tp:dark-paper`). An inline script in
  `index.html` applies them before first paint.
- `src/components/question-card/`: the question card and its practice,
  grading and error states. `types.ts` holds the view types the Phase 3
  grader adapter will map into.
- `src/routes/`: home, subject index, topic page (`topic/`: filters, the
  mark-scheme panel). Filters and the open mark scheme live in the URL.
- `src/lib/view-choice.ts`: the classic/app choice, shared with the classic
  pages under the localStorage key `tp:view`.
- `src/routes/dev/`: `/dev/card` (dev and preview builds only).
