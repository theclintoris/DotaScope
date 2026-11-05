import { chromium } from 'playwright-core'

const PORT = process.env.CDP_PORT ?? '9240'
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
const context = browser.contexts()[0]
const pages = context?.pages() ?? []
const page = pages.find((p) => p.url().includes('dotascope.local')) ?? pages[0]
if (!page) {
  console.error('No DotaScope WebView2 page found')
  process.exit(1)
}

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`) })

const livePayload = {
  provider: { name: 'Dota 2', appid: 570, version: 57, timestamp: Math.floor(Date.now() / 1000) },
  map: { name: 'start', matchid: '9999999999', game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', game_time: 1520, clock_time: 1520, daytime: true, team2_score: 17, team3_score: 12 },
  player: { steamid: '76561198255966928', accountid: 295731192, name: 'Lemongrab', team: 2, kills: 7, deaths: 2, assists: 9, gold: 15400, gpm: 612, xpm: 744, net_worth: 15400, last_hits: 98, denies: 4 },
  hero: { id: 95, name: 'npc_dota_hero_venomancer', level: 18, health: 1428, max_health: 1620, mana: 399, max_mana: 399 },
  items: {
    slot0: { name: 'item_blink' }, slot1: { name: 'item_black_king_bar' }, slot2: { name: 'item_phase_boots' },
    slot3: { name: 'item_magic_wand' }, slot4: { name: 'item_ultimate_scepter' }, slot5: { name: 'item_shivas_guard' },
  },
  draft: { team2: { 0: 95, 1: 8, 2: 14 }, team3: { 0: 32, 1: 39, 2: 74 } },
}

const postPayload = {
  provider: { name: 'Dota 2', appid: 570, version: 57, timestamp: Math.floor(Date.now() / 1000) },
  map: { name: 'start', matchid: '9077012903', game_state: 'DOTA_GAMERULES_STATE_POST_GAME', game_time: 1500, clock_time: 1500, daytime: true },
  player: { team: 2, name: 'QA', accountid: 1 },
  hero: { id: 5, name: 'npc_dota_hero_venomancer', level: 18 },
  items: { slot0: { name: 'item_blink' } },
  draft: { team2: {}, team3: {} },
}

await page.waitForTimeout(3000)
await page.evaluate(() => { window.location.hash = '#/parser' })
await page.waitForTimeout(4500)
const parserOnline = await page.locator('.parser-status-pill.is-online').count()
const replayCards = await page.locator('.parser-replay').count()
if (await page.locator('.parser-replay', { hasText: '9077012903' }).count()) {
  await page.locator('.parser-replay', { hasText: '9077012903' }).click()
  await page.waitForTimeout(500)
  const parseButton = page.locator('.parser-actions .btn-primary')
  if (await parseButton.count()) {
    await parseButton.click()
    await page.waitForSelector('.parser-result', { timeout: 30000 }).catch(() => {})
  }
}
const parseRows = await page.locator('.parser-result tbody tr').count()
const parseTitle = await page.locator('.parser-result h2').textContent().catch(() => null)
await page.screenshot({ path: 'screenshots/native-parser-lab.png' })

// auto parse a finished Turbo game through the real native GSI bridge
await postPayloadToBridge(postPayload)
await page.evaluate(() => { window.location.hash = '#/heroes' })
await page.waitForTimeout(1000)
let autoText = null
try {
  await page.waitForSelector('.auto-parse-toast.is-success', { timeout: 35000 })
  autoText = (await page.locator('.auto-parse-toast').innerText()).replace(/\s+/g, ' ').trim()
} catch (error) {
  errors.push(`auto parse: ${error.message}`)
}
const autoClass = await page.locator('.auto-parse-toast').getAttribute('class').catch(() => null)
await page.screenshot({ path: 'screenshots/native-auto-parse.png' })

// mode switch on the heroes tab
const modeActiveBefore = await page.locator('.topbar-mode-btn.is-active').innerText().catch(() => null)
await page.locator('.topbar-mode-btn', { hasText: 'Turbo' }).click()
await page.waitForTimeout(2500)
const modeActiveAfter = await page.locator('.topbar-mode-btn.is-active').innerText().catch(() => null)
const turboLens = await page.locator('.lens-population').innerText().catch(() => null)
await page.screenshot({ path: 'screenshots/native-mode-switch.png' })

// GSI header fix on the live tab
await postPayloadToBridge(livePayload)
await page.evaluate(() => { window.location.hash = '#/live' })
await page.waitForTimeout(3500)
const liveText = (await page.locator('.live-topline').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
const liveHero = await page.locator('.live-hero-copy h1').textContent().catch(() => null)
const liveErrors = await page.locator('.state-error').count()
await page.screenshot({ path: 'screenshots/native-live-final.png' })

console.log(JSON.stringify({
  parserOnline: Boolean(parserOnline), replayCards, parseRows, parseTitle,
  autoClass, autoText, modeActiveBefore, modeActiveAfter, turboLens: turboLens?.replace(/\s+/g, ' ').trim(),
  liveHero, liveText: liveText.slice(0, 300), liveErrors, errors,
}, null, 2))
process.exit(0)

async function postPayloadToBridge(payload) {
  const response = await fetch('http://127.0.0.1:53000/gsi', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Valve/Steam HTTP Client 1.0' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) errors.push(`GSI POST ${response.status}`)
}
