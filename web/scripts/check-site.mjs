// End-to-end checks of the assembled site (web/site), served like Vercel.
//   npm run build && node scripts/check-site.mjs [outDir]
// Fails on: any classic URL not serving, app/classic question lists that
// differ, a broken classic<->app switch, console errors or warnings, failed
// requests, horizontal overflow at 375px, or axe violations.
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const siteDir = fileURLToPath(new URL('../site', import.meta.url))
const outDir = path.resolve(process.argv[2] ?? 'screenshots/site')
mkdirSync(outDir, { recursive: true })
const PORT = 4174
const BASE = `http://localhost:${PORT}`
// Vercel's analytics script only exists on Vercel.
const IGNORED = ['/_vercel/insights/script.js']

const problems = []
const fail = (msg) => problems.push(msg)

const server = spawn(process.execPath, [fileURLToPath(new URL('./serve-site.mjs', import.meta.url)), String(PORT)], { stdio: 'pipe' })
await new Promise((resolve) => server.stdout.once('data', resolve))
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

async function newPage(name, { width = 1440, height = 900, javaScriptEnabled = true, theme } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, javaScriptEnabled, deviceScaleFactor: width < 600 ? 2 : 1 })
  if (theme) await context.addInitScript((t) => localStorage.setItem('tp:theme', t), theme)
  const page = await context.newPage()
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !IGNORED.some((u) => (m.location().url ?? '').includes(u)) && !/_vercel\/insights/.test(m.text()))
      fail(`${name}: console.${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => fail(`${name}: page error: ${e.message}`))
  page.on('response', (r) => {
    if (r.status() >= 400 && !IGNORED.some((u) => r.url().includes(u))) fail(`${name}: HTTP ${r.status()} ${r.url()}`)
  })
  return { context, page }
}

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 30))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => [...document.images].every((i) => i.complete))
}

async function axe(page, name) {
  await page.addScriptTag({ content: axeSource })
  const { violations } = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }))
  for (const v of violations) fail(`${name}: axe ${v.id}: ${v.help} (${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')})`)
}

async function fullShot(page, file) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  const width = page.viewportSize().width
  await page.setViewportSize({ width, height: Math.min(height, 12000) })
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outDir, file) })
}

// 1. Every classic URL still serves.
{
  const classic = ['/', '/index.html']
  for (const subject of ['9702', '9618', '9990']) {
    classic.push(`/${subject}/index.html`)
    for (const entry of readdirSync(path.join(siteDir, subject), { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'answer-assets')
        classic.push(`/${subject}/${entry.name}/questions.html`, `/${subject}/${entry.name}/answers.html`)
    }
  }
  for (const url of classic) {
    const res = await fetch(BASE + url)
    if (res.status !== 200) fail(`classic ${url}: HTTP ${res.status}`)
  }
  console.log(`classic URLs checked: ${classic.length}`)
}

// 2. Parity: every app topic page lists the classic page's questions, in order.
{
  const { context, page } = await newPage('parity')
  let topics = 0
  for (const subject of ['9702', '9618', '9990']) {
    const index = JSON.parse(readFileSync(path.join(siteDir, 'content', subject, 'index.json'), 'utf8'))
    for (const t of index.topics) {
      const html = readFileSync(path.join(siteDir, subject, t.slug, 'questions.html'), 'utf8')
      const classicIds = [...html.matchAll(/<article class='question' id='([^']+)'/g)].map((m) => m[1])
      await page.goto(`${BASE}/app/${subject}/${t.slug}?repeats=show`)
      await page.waitForSelector('article.question-card, main p')
      const appIds = await page.$$eval('article.question-card', (els) => els.map((e) => e.id))
      if (JSON.stringify(appIds) !== JSON.stringify(classicIds))
        fail(`parity ${t.slug}: app ${appIds.length} vs classic ${classicIds.length} questions (or order differs)`)
      const distinct = await (async () => {
        await page.goto(`${BASE}/app/${subject}/${t.slug}`)
        await page.waitForSelector('article.question-card')
        return page.$$eval('article.question-card', (els) => els.length)
      })()
      if (distinct !== t.distinct_count) fail(`repeats ${t.slug}: showing ${distinct}, expected ${t.distinct_count}`)
      topics++
    }
  }
  console.log(`topics compared with classic: ${topics}`)
  await context.close()
}

// 3. Classic <-> app switching and the remembered choice.
{
  const { context, page } = await newPage('switch')
  await page.goto(`${BASE}/`)
  if (new URL(page.url()).pathname !== '/') fail('switch: a new visitor was sent away from classic /')
  await page.click('text=Try the new view')
  await page.waitForURL('**/app/')
  await page.waitForSelector('h1')
  await page.goto(`${BASE}/`)
  await page.waitForURL('**/app/')
  if (!page.url().endsWith('/app/')) fail('switch: after using the app, / did not forward to /app/')
  await page.click('header >> text=Classic view')
  await page.waitForLoadState('load')
  if (new URL(page.url()).pathname !== '/') fail(`switch: Classic view went to ${page.url()}`)
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(300)
  if (new URL(page.url()).pathname !== '/') fail('switch: after choosing classic, / still forwarded to the app')
  // Topic-level links in both directions.
  await page.goto(`${BASE}/9702/9702-topic-12-motion-in-a-circle/questions.html`)
  await page.click('text=Try the new view')
  await page.waitForURL('**/app/9702/9702-topic-12-motion-in-a-circle')
  await page.goto(`${BASE}/9702/9702-topic-12-motion-in-a-circle/answers.html#9702-2023-on-42-q01`)
  await page.click('text=Try the new view')
  await page.waitForURL('**/app/9702/9702-topic-12-motion-in-a-circle?answers=9702-2023-on-42-q01')
  await page.waitForSelector('#answer-panel')
  await page.click('header >> text=Classic view')
  await page.waitForLoadState('load')
  if (!page.url().includes('/answers.html') || !page.url().endsWith('#9702-2023-on-42-q01'))
    fail(`switch: Classic view from an open mark scheme went to ${page.url()}`)
  await context.close()
  // No JavaScript: classic stays put.
  const nojs = await newPage('no-js', { javaScriptEnabled: false })
  await nojs.page.goto(`${BASE}/`)
  if (new URL(nojs.page.url()).pathname !== '/') fail('no-js: / did not stay on classic')
  await nojs.context.close()
  console.log('switching checked')
}

// 4. Answer panel: deep link, focus, Escape, focus return.
{
  const { context, page } = await newPage('panel')
  await page.goto(`${BASE}/app/9702/9702-topic-12-motion-in-a-circle?answers=9702-2023-on-42-q01`)
  await page.waitForSelector('#answer-panel')
  const focused = await page.evaluate(() => document.activeElement?.id)
  if (focused !== 'answer-panel-title') fail(`panel: focus on "${focused}", expected the panel heading`)
  await page.keyboard.press('Escape')
  await page.waitForSelector('#answer-panel', { state: 'detached' })
  const back = await page.evaluate(() => document.activeElement?.getAttribute('data-question'))
  if (back !== '9702-2023-on-42-q01') fail(`panel: focus returned to "${back}", expected the Answer button`)
  if (new URL(page.url()).searchParams.has('answers')) fail('panel: ?answers stayed in the URL after closing')
  await context.close()
}

// 5. Screenshots, axe and overflow for each page type.
const TOPIC = '/app/9702/9702-topic-12-motion-in-a-circle'
const shots = [
  { name: 'home-desktop', url: '/app/', width: 1440 },
  { name: 'subject-desktop', url: '/app/9702', width: 1440 },
  { name: 'topic-desktop', url: TOPIC, width: 1440 },
  { name: 'topic-desktop-answer', url: `${TOPIC}?answers=9702-2023-on-42-q01`, width: 1440 },
  { name: 'topic-desktop-dark', url: `${TOPIC}?answers=9702-2023-on-42-q01`, width: 1440, theme: 'dark' },
  { name: 'topic-mobile', url: TOPIC, width: 375 },
  { name: 'topic-mobile-answer', url: `${TOPIC}?answers=9702-2023-on-42-q01`, width: 375 },
  { name: 'home-mobile', url: '/app/', width: 375 },
]
for (const s of shots) {
  const { context, page } = await newPage(s.name, { width: s.width, theme: s.theme })
  await page.goto(BASE + s.url)
  await settle(page)
  if (s.width === 375) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    if (overflow > 0) fail(`${s.name}: horizontal overflow ${overflow}px`)
  }
  await axe(page, s.name)
  if (s.name.endsWith('answer') && s.width === 375) await page.screenshot({ path: path.join(outDir, `${s.name}.png`) })
  else await fullShot(page, `${s.name}.png`)
  await context.close()
}
// Filter menu: collapsed by default, fades in beside (wide) or above (phone)
// the questions, remembered, and unreachable by keyboard while closed.
for (const width of [1440, 375]) {
  const name = `filters-${width}`
  const { context, page } = await newPage(name, { width })
  await page.goto(BASE + TOPIC)
  await settle(page)
  const region = width >= 1024 ? '#topic-filters' : '#topic-filters-inline'
  const button = page.locator('button[aria-controls]', { hasText: 'Filters' })
  if ((await button.getAttribute('aria-expanded')) !== 'false') fail(`${name}: filters not collapsed by default`)
  if (!(await page.locator(region).evaluate((el) => el.inert))) fail(`${name}: closed filters are not inert`)
  await button.click()
  await page.waitForTimeout(400)
  if ((await page.locator(region).evaluate((el) => getComputedStyle(el).opacity)) !== '1') fail(`${name}: filters did not fade in`)
  await page.locator(`${region} label:has-text("2023")`).click()
  await page.waitForURL(/year=2023/)
  await axe(page, name)
  await page.screenshot({ path: path.join(outDir, `topic-${width < 600 ? 'mobile' : 'desktop'}-filters.png`) })
  await page.reload()
  await page.waitForSelector('article.question-card')
  if ((await button.getAttribute('aria-expanded')) !== 'true') fail(`${name}: open state not remembered`)
  await context.close()
}
// Print: A4, like the classic printed pages.
{
  const { context, page } = await newPage('print', { width: 1280, theme: 'dark' })
  await page.goto(BASE + TOPIC)
  await settle(page)
  await page.emulateMedia({ media: 'print' })
  await page.pdf({ path: path.join(outDir, 'topic-print.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true })
  await context.close()
}

await browser.close()
server.kill()
if (problems.length) {
  console.error(problems.join('\n'))
  console.error(`${problems.length} problem(s)`)
  process.exit(1)
}
console.log(`OK: screenshots in ${outDir}`)
