import { chromium } from 'playwright-core'
import fs from 'node:fs'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9242')
const contexts = browser.contexts()
const context = contexts[0]
const pages = context.pages()
const page = pages.find((candidate) => !candidate.isClosed()) ?? await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

const report = {}
const base = 'https://dotascope.local/index.html?runtime=desktop'

await page.goto(`${base}#/players/295731192`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.player-hero h1', { timeout: 30000 })
await page.waitForTimeout(9000)
const turboButton = page.locator('.topbar-mode-btn', { hasText: 'Turbo' })
if (await turboButton.count()) {
  const active = await turboButton.getAttribute('aria-pressed')
  if (active !== 'true') await turboButton.click()
}
await page.waitForTimeout(5000)
report.player = {
  title: await page.title(),
  kpis: await page.locator('.kpi').allInnerTexts(),
  benchmark: await page.locator('.turbo-benchmark').count(),
  mode: await page.locator('.topbar-mode-btn.is-active').innerText().catch(() => ''),
}
await page.screenshot({ path: 'screenshots/native-turbo-benchmark-final.png', fullPage: false })

await page.goto(`${base}#/parser`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
report.parser = {
  body: (await page.locator('body').innerText()).slice(0, 1200),
  replays: await page.locator('.parser-replay').count(),
  workerOnline: await page.locator('text=WORKER ONLINE').count(),
  workerOffline: await page.locator('text=WORKER OFFLINE').count(),
}
if (report.parser.replays) {
  await page.locator('.parser-replay').first().click()
  const parseButton = page.locator('button', { hasText: 'Parse replay' })
  if (await parseButton.count()) {
    await parseButton.first().click()
    await page.waitForSelector('.parser-result', { timeout: 60000 })
    await page.waitForTimeout(1000)
    report.parser.tableRows = await page.locator('.parser-table tbody tr').count()
    report.parser.resultText = (await page.locator('.parser-result').innerText()).slice(0, 1200)
  }
}
await page.screenshot({ path: 'screenshots/native-parser-lab-final.png', fullPage: false })

await page.goto(`${base}#/players/295731192`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.player-hero h1', { timeout: 30000 })
await page.waitForTimeout(2000)
const payload = {
  map: {
    name: 'DOTA_GAMERULES_STATE_POST_GAME',
    matchid: '9077012903',
    game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
    game_mode: '23',
    game_time: 1800,
    clock_time: 1800,
    radiant_score: 30,
    dire_score: 33,
  },
  hero: { id: 74, name: 'npc_dota_hero_invoker', level: 20, alive: true },
  player: { team: 'dire', gold: 2000, kills: 3, deaths: 5, assists: 10 },
}
await page.evaluate(async (body) => {
  await fetch('http://127.0.0.1:53000/gsi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}, payload)
await page.waitForTimeout(1000)
const gsi = await page.evaluate(async () => {
  const response = await fetch('http://127.0.0.1:53000/gsi/latest')
  return { status: response.status, text: (await response.text()).slice(0, 300) }
})
report.gsi = gsi
let toastClass = ''
try {
  await page.waitForSelector('.auto-parse-toast', { timeout: 30000 })
  await page.waitForTimeout(18000)
  toastClass = await page.locator('.auto-parse-toast').getAttribute('class') ?? ''
  report.toast = (await page.locator('.auto-parse-toast').innerText()).slice(0, 500)
} catch (error) {
  report.toastError = String(error)
}
report.toastClass = toastClass
report.errors = errors.slice(0, 20)
await page.screenshot({ path: 'screenshots/native-auto-parse-final.png', fullPage: false })
console.log(JSON.stringify(report, null, 2))
process.exit(0)
