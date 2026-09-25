import { chromium } from 'playwright-core'
const out = process.argv[2]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errs = []; p.on('console', m => ['error','warning'].includes(m.type()) && errs.push(m.text())); p.on('pageerror', e => errs.push('PAGEERR ' + e.message))
await p.goto('http://localhost:5173/app/practice?subject=9702&topic=9702-topic-19-capacitance', { waitUntil: 'networkidle' })
await p.screenshot({ path: out + '/picker.png' })
await p.fill('input[type=range]', '3').catch(()=>{})
await p.locator('input[type=range]').evaluate((el) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,'3'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})) })
await p.click('button:has-text("Start")')
await p.waitForURL(/practice\/set/)
await p.waitForSelector('article section[data-part]')
console.log('url', p.url())
await p.screenshot({ path: out + '/set.png' })
// answer first textarea
const ta = p.locator('main textarea').first(); await ta.fill('Q = CV, so the charge stored is proportional.')
// find a diagram part across questions
console.log('parts q1', await p.locator('article section[data-part]').count())
await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('article section[data-part]')
console.log('persisted', await p.locator('main textarea').first().inputValue())
console.log('errors', errs)
await b.close()
