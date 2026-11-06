const { chromium } = require('playwright-core')

const BASE = 'http://localhost:4182/?runtime=desktop'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MATCH_ID = 9078220686

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, screen: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  const parseCalls = []
  let parseSucceeds = false
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('ERR_FAILED') && !message.text().includes('Failed to load resource')) {
      errors.push(`console: ${message.text()}`)
    }
  })

  await page.route('**/gsi/latest', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        bridge: true,
        available: true,
        receivedAt: Date.now(),
        payload: {
          map: {
            matchid: String(MATCH_ID),
            game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
          },
        },
      }),
    })
  })

  await page.route('**/parse', async (route) => {
    const body = route.request().postDataJSON()
    parseCalls.push({ matchId: body?.matchId, download: body?.download, competitiveOnly: body?.competitiveOnly })
    if (!parseSucceeds) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'No replay URL is available for this match yet.' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        match: { matchId: String(MATCH_ID), gameMode: 23, gameModeName: 'Turbo' },
        players: [],
        timeline: [],
        wards: [],
      }),
    })
  })

  await page.goto(`${BASE}#/records`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(14500)
  const firstToast = await page.locator('.auto-parse-toast').innerText().catch(() => 'none')
  const pendingAfterFailure = await page.evaluate((key) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
  }, 'dotascope.pendingReplays')
  await page.screenshot({ path: 'screenshots/pending-replay-waiting.png' })

  // Make the queued retry due immediately, then let the mocked worker succeed.
  await page.evaluate((key) => {
    const pending = JSON.parse(localStorage.getItem(key) || '[]')
    if (pending[0]) {
      pending[0].nextAttemptAt = Date.now() - 1
      localStorage.setItem(key, JSON.stringify(pending))
    }
  }, 'dotascope.pendingReplays')
  parseSucceeds = true
  await page.waitForTimeout(6500)
  const successToast = await page.locator('.auto-parse-toast').innerText().catch(() => 'none')
  const pendingAfterSuccess = await page.evaluate((key) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
  }, 'dotascope.pendingReplays')
  await page.screenshot({ path: 'screenshots/pending-replay-success.png' })

  // Real match with no replay_url should explain the blocker rather than pitch an API key.
  await page.unroute('**/gsi/latest')
  await page.unroute('**/parse')
  await page.goto(`${BASE}#/matches/9077882360`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(11000)
  const noReplayPanel = await page.locator('.parse-panel').innerText().catch(() => 'none')
  const hasApiKeyCta = await page.locator('.parse-panel').getByText('Add API key', { exact: true }).count().catch(() => 0)
  await page.screenshot({ path: 'screenshots/no-replay-source.png', fullPage: true })

  await browser.close()
  console.log(JSON.stringify({
    parseCalls,
    firstToast,
    pendingAfterFailure,
    successToast,
    pendingAfterSuccess,
    noReplayPanel,
    hasApiKeyCta,
    errors,
  }, null, 2))
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
