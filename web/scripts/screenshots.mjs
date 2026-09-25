// Screenshots + checks for a page of the running dev server.
//   node scripts/screenshots.mjs [outDir] [path]
// Captures light, dark, dark-paper (desktop), light + dark at 375px, and an
// A4 print PDF. Fails on console errors/warnings, page errors, horizontal
// overflow at 375px, or axe accessibility violations.
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

const outDir = path.resolve(process.argv[2] ?? 'screenshots')
const route = process.argv[3] ?? '/app/dev/card'
const base = process.env.BASE_URL ?? 'http://localhost:5173'
const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
mkdirSync(outDir, { recursive: true })

const problems = []
const browser = await chromium.launch({ executablePath })

async function open({ name, width, theme, paper, reducedMotion = 'no-preference' }) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: width < 600 ? 2 : 1,
    reducedMotion,
  })
  await context.addInitScript(
    ([t, p]) => {
      localStorage.setItem('tp:theme', t)
      if (p) localStorage.setItem('tp:dark-paper', '1')
    },
    [theme, paper],
  )
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) problems.push(`${name}: console.${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`${name}: page error: ${err.message}`))
  page.on('requestfailed', (req) => problems.push(`${name}: request failed: ${req.url()}`))
  page.on('response', (res) => {
    if (res.status() >= 400) problems.push(`${name}: HTTP ${res.status()} ${res.url()}`)
  })
  await page.goto(base + route, { waitUntil: 'networkidle' })
  // Lazy images below the fold: scroll through so every crop loads.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 40))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => [...document.images].every((img) => img.complete))
  await page.waitForTimeout(700) // let count-up animations settle
  return { context, page }
}

async function axe(page, name) {
  await page.addScriptTag({ content: axeSource })
  const result = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }))
  for (const v of result.violations) {
    problems.push(`${name}: axe ${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  }
}

const shots = [
  { name: 'desktop-light', width: 1600, theme: 'light' },
  { name: 'desktop-dark', width: 1600, theme: 'dark' },
  { name: 'desktop-dark-paper', width: 1600, theme: 'dark', paper: true },
  { name: 'mobile-375-light', width: 375, theme: 'light' },
  { name: 'mobile-375-dark', width: 375, theme: 'dark' },
]

for (const shot of shots) {
  const { context, page } = await open(shot)
  if (shot.width === 375) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 0) problems.push(`${shot.name}: horizontal overflow of ${overflow}px`)
  }
  await axe(page, shot.name)
  // Grow the viewport to the whole page and capture one paint: Chromium's
  // fullPage stitching drops filtered images far down tall pages.
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({ width: shot.width, height })
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))))
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(outDir, `${shot.name}.png`) })
  await context.close()
}

// Reduced motion: nothing should animate.
{
  const { context, page } = await open({ name: 'reduced-motion', width: 1280, theme: 'light', reducedMotion: 'reduce' })
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)
  if (running > 0) problems.push(`reduced-motion: ${running} animation(s) still running`)
  await context.close()
}

// Print: A4 PDF, as the browser's print preview would paginate it.
{
  const { context, page } = await open({ name: 'print', width: 1280, theme: 'dark', paper: true })
  await page.emulateMedia({ media: 'print' })
  await page.pdf({ path: path.join(outDir, 'print.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true })
  await context.close()
}

await browser.close()
if (problems.length) {
  console.error(problems.join('\n'))
  console.error(`${problems.length} problem(s)`)
  process.exit(1)
}
console.log(`OK: screenshots and print.pdf in ${outDir}`)
