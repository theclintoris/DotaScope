import { chromium } from 'playwright-core'

const BASE = 'http://127.0.0.1:4176'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, executablePath: CHROME })

const payload = {
  bridge: true,
  available: true,
  receivedAt: new Date().toISOString(),
  payload: {
    provider: { name: 'Dota 2', appid: 570 },
    map: {
      name: 'start',
      matchid: '9077012903',
      game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
      game_time: 1500,
      clock_time: 1500,
    },
    player: { team: 2, name: 'QA', accountid: 1 },
    hero: { id: 5, name: 'npc_dota_hero_venomancer', level: 18 },
    items: { slot0: { name: 'item_blink' } },
    draft: { team2: {}, team3: {} },
  },
}

async function test(viewport, mobile, name) {
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  await page.route('**/gsi/latest', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(payload) })
  })
  await page.goto(`${BASE}/?runtime=desktop#/heroes`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.auto-parse-toast', { timeout: 15000 })
  let state = 'working'
  try {
    await page.waitForSelector('.auto-parse-toast.is-success, .auto-parse-toast.is-error, .auto-parse-toast.is-info', { timeout: 30000 })
    state = await page.locator('.auto-parse-toast').getAttribute('class')
  } catch {}
  const text = await page.locator('.auto-parse-toast').innerText().catch(() => '')
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: false })
  await context.close()
  return { state, text: text.replace(/\s+/g, ' ').trim(), errors }
}

const desktop = await test({ width: 1440, height: 1000 }, false, 'auto-parse-toast-success')
const mobile = await test({ width: 412, height: 915 }, true, 'auto-parse-toast-mobile')
console.log(JSON.stringify({ desktop, mobile }, null, 2))
await browser.close()
