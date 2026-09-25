// Browser test of practice sets (needs `npm run dev` running).
//   node scripts/check-practice.mjs [outDir]
// Walks a whole set end to end: picker, answering (typing, gaps, symbols,
// drawing, flags, persistence across reload), Practice-mode mark scheme,
// submit, self-marking. Screenshots every screen at desktop and phone width,
// light and dark; axe on each; no console errors. Uses reviewed questions
// only and cleans up its localStorage.
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const outDir = path.resolve(process.argv[2] ?? 'screenshots/practice')
mkdirSync(outDir, { recursive: true })
const BASE = 'http://localhost:5173/app'
const CS = '9618-topic-19-computational-thinking-and-problem-solving'
// A fill-in-the-gaps question and a trace table (a diagram part).
const SET = `${BASE}/practice/set?s=9618&t=${CS}&q=9618-2022-on-31-q12,9618-2025-mj-33-q13&mode=test`
const problems = []
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

async function page(viewport, theme = 'light') {
  const context = await browser.newContext({ viewport })
  await context.addInitScript((t) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear()
      localStorage.setItem('tp:theme', t)
      sessionStorage.setItem('seeded', '1')
    }
  }, theme)
  const p = await context.newPage()
  p.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`console.${m.type()}: ${m.text()}`))
  p.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
  return p
}

async function axe(p, name) {
  await p.addScriptTag({ content: axeSource })
  const { violations } = await p.evaluate(() => window.axe.run(document))
  for (const v of violations) problems.push(`axe on ${name} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')})`)
}

async function settle(p) {
  // Lazy images below the fold never load on their own; screenshots need them.
  await p.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => (i.loading = 'eager')))
  await p.waitForFunction(() => [...document.images].every((i) => i.complete))
  await p.waitForTimeout(150)
}

try {
  // Warm up: the dev server may re-optimise dependencies on first load.
  const warm = await page({ width: 1440, height: 900 })
  await warm.goto(`${BASE}/practice`, { waitUntil: 'networkidle' })
  await warm.waitForTimeout(1500)
  await warm.context().close()
  problems.length = 0

  // 1. Picker.
  const p = await page({ width: 1440, height: 900 })
  await p.goto(`${BASE}/practice?subject=9618&topic=${CS}`, { waitUntil: 'networkidle' })
  await p.waitForSelector('text=Build a practice set')
  if (!(await p.isChecked(`input[value="${CS}"]`))) problems.push('picker: topic from the URL not selected')
  if (!(await p.isDisabled('input[value="9618-topic-13-data-representation"]'))) problems.push('picker: topic with no checked questions is selectable')
  await p.locator('input[type=range]').fill('2')
  if (!(await p.textContent('aside')).includes('Start 2 questions')) problems.push('picker: slider did not change the count')
  await axe(p, 'picker')
  await p.screenshot({ path: path.join(outDir, 'picker-desktop.png') })
  await p.click('aside button:has-text("Start")')
  await p.waitForURL(/practice\/set\?/)
  const ids = new URL(p.url()).searchParams.get('q').split(',')
  if (ids.length !== 2 || new Set(ids).size !== 2) problems.push(`picker: drew ${ids}`)

  // 2. Answering: gaps, symbols, persistence.
  await p.goto(SET, { waitUntil: 'networkidle' })
  await p.waitForSelector('article .gap-input')
  const gaps = p.locator('article .gap-input')
  if ((await gaps.count()) !== 6) problems.push(`answering: ${await gaps.count()} gap inputs, expected 6`)
  await gaps.nth(0).fill('Upper ← 99')
  await gaps.nth(1).fill('IF Lower > Upper')
  await p.locator('[role=toolbar][aria-label="Insert a symbol"] button:has-text("π")').click()
  if ((await gaps.nth(1).inputValue()) !== 'IF Lower > Upperπ') problems.push('answering: symbol not inserted at the caret')
  await p.locator('textarea[aria-label^="(b)(i)"]').fill('O(n)')
  if (!(await p.textContent('#answer-a-title >> xpath=../..')).includes('2/6')) problems.push('answering: gap progress not shown')
  await p.click('button:has-text("Flag for review")')
  await settle(p)
  await axe(p, 'answering')
  await p.screenshot({ path: path.join(outDir, 'answering-desktop.png') })
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForSelector('article .gap-input')
  if ((await gaps.nth(0).inputValue()) !== 'Upper ← 99') problems.push('answering: gap answer lost on reload')
  if (!(await p.isVisible('button[aria-pressed="true"]:has-text("Flagged")'))) problems.push('answering: flag lost on reload')

  // 3. Drawing on the trace table (the second figure, after the instruction).
  await p.click('footer button:has-text("Next question")')
  await p.waitForSelector('svg[role=application]')
  const caption = await p.locator('svg[role=application]').getAttribute('aria-label')
  if (!/Fig|figure/.test(caption) || (await p.locator('svg[role=application]').count()) !== 1) problems.push(`drawing: unexpected layer ${caption}`)
  const svg = p.locator('svg[role=application]')
  await svg.scrollIntoViewIfNeeded()
  const box = await svg.boundingBox()
  await p.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.4)
  await p.mouse.down()
  await p.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6, { steps: 6 })
  await p.mouse.up()
  await p.click('button[aria-label="Straight line"]')
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3)
  await p.mouse.down()
  await p.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 4 })
  await p.mouse.up()
  const drawn = await svg.locator('path').count()
  await p.click('button[aria-label="Undo"]')
  const undone = await svg.locator('path').count()
  await p.click('button[aria-label="Redo"]')
  if (drawn !== 2 || undone !== 1 || (await svg.locator('path').count()) !== 2) problems.push(`drawing: ${drawn} marks, ${undone} after undo`)
  await settle(p)
  await p.screenshot({ path: path.join(outDir, 'drawing-desktop.png') })

  // 4. Submit and self-mark.
  await p.click('header button:has-text("Submit set")')
  await p.waitForSelector('[role=dialog]')
  if (!(await p.textContent('[role=dialog]')).includes('not answered')) problems.push('submit: unanswered parts not mentioned')
  await p.click('[role=dialog] button:has-text("Submit")')
  await p.waitForURL(/practice\/results/)
  await p.waitForSelector('[role=radiogroup]')
  await p.locator('[role=radiogroup]').first().locator('[role=radio]').nth(4).click()
  if (!(await p.textContent('main')).includes('4/9')) problems.push('results: self-mark not totalled')
  await settle(p)
  await axe(p, 'results')
  await p.screenshot({ path: path.join(outDir, 'results-desktop.png'), fullPage: true })
  // A submitted set reopens at its results.
  await p.goto(SET, { waitUntil: 'networkidle' })
  await p.waitForURL(/practice\/results/)

  // 5. Practice mode: the mark scheme opens on request.
  const practice = await page({ width: 1440, height: 900 })
  await practice.goto(SET.replace('mode=test', 'mode=practice'), { waitUntil: 'networkidle' })
  await practice.click('button:has-text("Check with the mark scheme")')
  await practice.waitForSelector('[role=dialog] img')
  await settle(practice)
  await practice.screenshot({ path: path.join(outDir, 'practice-check-desktop.png') })
  await practice.keyboard.press('Escape')

  // 6. Phone and dark mode.
  for (const theme of ['light', 'dark']) {
    const phone = await page({ width: 390, height: 844 }, theme)
    await phone.goto(`${BASE}/practice?subject=9618&topic=${CS}`, { waitUntil: 'networkidle' })
    await phone.waitForSelector('text=Build a practice set')
    await phone.screenshot({ path: path.join(outDir, `picker-phone-${theme}.png`), fullPage: true })
    await phone.goto(SET, { waitUntil: 'networkidle' })
    await phone.waitForSelector('[role=tablist]')
    await settle(phone)
    await axe(phone, `answering phone ${theme}`)
    await phone.screenshot({ path: path.join(outDir, `question-phone-${theme}.png`) })
    await phone.click('[role=tab]:has-text("Answer")')
    await phone.screenshot({ path: path.join(outDir, `answer-phone-${theme}.png`) })
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    if (overflow) problems.push(`phone ${theme}: page scrolls sideways`)
    if (theme === 'dark') {
      const desk = await page({ width: 1440, height: 900 }, 'dark')
      await desk.goto(SET, { waitUntil: 'networkidle' })
      await desk.waitForSelector('article .gap-input')
      await settle(desk)
      await axe(desk, 'answering dark')
      await desk.screenshot({ path: path.join(outDir, 'answering-desktop-dark.png') })
    }
  }
} finally {
  await browser.close()
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`practice sets: OK (screenshots in ${outDir})`)
