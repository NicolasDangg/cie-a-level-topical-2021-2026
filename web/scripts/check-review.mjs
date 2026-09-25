// Browser test of the extraction review tool (needs `npm run dev` running).
//   node scripts/check-review.mjs [outDir]
// Uses content/9702/questions/9702-2023-on-42-q01.json and always restores it.
// Checks: renders text, figure and units; approve with A; an edit that breaks
// the marks is saved as a draft with the problem shown and Approve disabled;
// figure boxes drag, nudge with arrows (without changing question) and save;
// no console errors; no axe violations.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const outDir = path.resolve(process.argv[2] ?? 'screenshots/review')
mkdirSync(outDir, { recursive: true })
const ID = '9702-2023-on-42-q01'
const file = fileURLToPath(new URL(`../../content/9702/questions/${ID}.json`, import.meta.url))
const original = readFileSync(file, 'utf8')
const url = `http://localhost:5173/app/dev/review/9702/9702-topic-12-motion-in-a-circle?q=${ID}`
const problems = []
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`console.${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500) // the dev server may re-optimise dependencies on first load
  problems.length = 0
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('article section[aria-label="Part (b)"]')
  await page.waitForFunction(() => [...document.images].every((i) => i.complete))
  if (!(await page.$eval('article figure img', (img) => img.naturalWidth > 0))) problems.push('figure image not loaded')
  if (!(await page.textContent('article')).includes('rad s⁻¹')) problems.push('numeric unit not rendered')
  await page.addScriptTag({ content: axeSource })
  const { violations } = await page.evaluate(() => window.axe.run(document))
  for (const v of violations) problems.push(`axe ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')})`)
  await page.screenshot({ path: path.join(outDir, 'review-draft.png'), fullPage: true })

  // Figure box editor: drag the right edge out, nudge with the keyboard, save.
  const before = JSON.parse(readFileSync(file, 'utf8')).figures[0].box
  const box = page.locator('[data-figure-box="f1"]')
  const b = await box.boundingBox()
  const scan = await page.locator('section[aria-label="Original scan"] figure').first().boundingBox()
  await page.mouse.move(b.x + b.width, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width - 40, b.y + b.height / 2, { steps: 4 })
  await page.mouse.up()
  await box.focus()
  await page.keyboard.press('ArrowDown')
  if (!(await page.url()).includes(ID)) problems.push('arrow key on a figure box changed question')
  const previewAspect = await page.$eval('article figure > div', (el) => el.style.aspectRatio)
  await page.locator('button:has-text("Save boxes")').click()
  await page.waitForSelector('button:has-text("Save boxes")', { state: 'detached' })
  const after = JSON.parse(readFileSync(file, 'utf8')).figures[0].box
  const expectedRight = before[2] - 40 / scan.width
  if (Math.abs(after[2] - expectedRight) > 0.01) problems.push(`drag not saved: right edge ${after[2]}, expected ~${expectedRight.toFixed(3)}`)
  if (Math.abs(after[1] - before[1] - 0.004) > 1e-6) problems.push(`arrow nudge not saved: top ${before[1]} -> ${after[1]}`)
  if (!previewAspect || previewAspect === 'auto') problems.push('preview figure missing')
  if (JSON.parse(readFileSync(file, 'utf8')).status !== JSON.parse(original).status) problems.push('saving boxes changed the status')
  const axe2 = await page.evaluate(() => window.axe.run(document))
  for (const v of axe2.violations) problems.push(`axe (boxes) ${v.id}: ${v.help}`)
  await page.screenshot({ path: path.join(outDir, 'review-boxes.png') })
  writeFileSync(file, original.replace('"status": "reviewed"', '"status": "draft"'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('article section[aria-label="Part (b)"]')

  await page.keyboard.press('a')
  await page.waitForURL((u) => !u.search.includes(ID))
  if (JSON.parse(readFileSync(file, 'utf8')).status !== 'reviewed') problems.push('A did not approve')

  await page.locator('nav button', { hasText: ID }).click()
  await page.waitForSelector(`main h1:has-text("${ID}")`)
  await page.waitForSelector('article section[aria-label="Part (a)"]')
  await page.keyboard.press('e')
  const text = await page.inputValue('#edit-json')
  await page.fill('#edit-json', text.replace('"marks": 1,', '"marks": 3,'))
  await page.keyboard.press('Control+Enter')
  await page.waitForSelector('[role="alert"]')
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  if (saved.status !== 'draft' || !saved.problems.some((p) => p.includes('add up to 12')))
    problems.push(`broken marks not caught: ${JSON.stringify(saved.problems)}`)
  if (!(await page.isDisabled('button:has-text("Approve")'))) problems.push('Approve enabled despite problems')
  await page.screenshot({ path: path.join(outDir, 'review-problems.png') })
} finally {
  writeFileSync(file, original)
  await browser.close()
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`review tool: OK (screenshots in ${outDir})`)
