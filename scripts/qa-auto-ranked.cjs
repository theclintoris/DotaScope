const { chromium } = require('playwright-core')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/gsi/latest', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        bridge: true,
        available: true,
        receivedAt: new Date().toISOString(),
        payload: {
          map: {
            game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
            matchid: '9076869158',
            game_mode: '22',
          },
          hero: { id: 121 },
          player: { team_name: 'radiant' },
        },
      }),
    })
  })
  await page.goto('http://localhost:4180/?runtime=desktop#/records', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.auto-parse-toast', { timeout: 25000 })
  await page.waitForFunction(() => {
    const toast = document.querySelector('.auto-parse-toast')
    return toast?.classList.contains('is-success') || toast?.classList.contains('is-info') || toast?.classList.contains('is-error')
  }, { timeout: 30000 })
  const result = await page.evaluate(() => ({
    cls: document.querySelector('.auto-parse-toast')?.className,
    title: document.querySelector('.auto-parse-copy strong')?.textContent,
    text: document.querySelector('.auto-parse-copy span')?.textContent,
    link: document.querySelector('.auto-parse-copy a')?.textContent,
  }))
  await page.screenshot({ path: 'screenshots/auto-parse-ranked.png' })
  console.log(JSON.stringify({ result, errors }, null, 2))
  await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
