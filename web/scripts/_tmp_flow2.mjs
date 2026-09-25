import { chromium } from 'playwright-core'
const out = process.argv[2]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errs = []; p.on('console', m => ['error','warning'].includes(m.type()) && errs.push(m.text())); p.on('pageerror', e => errs.push('PAGEERR ' + e.message))
// CS set with blanks, plus a physics diagram question
const set = 'http://localhost:5173/app/practice/set?s=9618&t=9618-topic-19-computational-thinking-and-problem-solving&q=9618-2022-on-31-q12,9618-2025-mj-33-q13&mode=test'
await p.goto(set, { waitUntil: 'networkidle' }); await p.waitForSelector('article .gap-input')
const gaps = p.locator('article .gap-input'); console.log('gap inputs', await gaps.count())
await gaps.nth(0).fill('Upper ← 99'); await gaps.nth(1).fill('IF Lower > Upper')
await p.locator('button:has-text("π")').click()
console.log('gap1 after symbol', await gaps.nth(1).inputValue())
await p.screenshot({ path: out + '/cs-gaps.png' })
// Q2: trace table (diagram) -> draw
await p.click('button:has-text("Next question")'); await p.waitForSelector('[role=toolbar][aria-label^="Drawing tools"]')
const svg = p.locator('svg[role=application]').first(); const box = await svg.boundingBox()
await p.mouse.move(box.x+60, box.y+100); await p.mouse.down(); await p.mouse.move(box.x+120, box.y+130, {steps:6}); await p.mouse.move(box.x+180, box.y+110, {steps:6}); await p.mouse.up()
await p.click('button[aria-label="Straight line"]'); await p.mouse.move(box.x+200, box.y+60); await p.mouse.down(); await p.mouse.move(box.x+300, box.y+160, {steps:5}); await p.mouse.up()
await p.click('button[aria-label^="Smooth curve"]'); for (const [x,y] of [[320,60],[360,120],[420,80]]) await p.mouse.click(box.x+x, box.y+y); await p.mouse.dblclick(box.x+460, box.y+140)
console.log('paths', await svg.locator('path').count())
await p.click('button[aria-label="Undo"]'); console.log('after undo', await svg.locator('path').count())
await p.screenshot({ path: out + '/draw.png' })
await p.click('button:has-text("Submit set") >> nth=0'); await p.waitForSelector('[role=dialog]'); await p.screenshot({ path: out + '/confirm.png' })
await p.click('[role=dialog] button:has-text("Submit")'); await p.waitForURL(/results/); await p.waitForSelector('[role=radiogroup]')
await p.locator('[role=radiogroup]').first().locator('[role=radio]').last().click()
await p.waitForTimeout(300)
await p.screenshot({ path: out + '/results.png', fullPage: true })
console.log('errors', errs)
await b.close()
