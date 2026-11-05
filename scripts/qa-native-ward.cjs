const { chromium } = require('playwright-core')
const fs = require('fs')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9251')
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await page.goto('https://dotascope.local/index.html?runtime=desktop#/matches/9077789924', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ward-map-panel', { timeout: 30000 })
  await page.waitForTimeout(800)
  const result = {
    wardPins: await page.locator('.ward-pin').count(),
    wardCount: await page.locator('.ward-map-panel .badge-local').innerText(),
    tooltip: '',
    scopes: [],
    friendRows: 0,
    lobbyRows: 0,
    errors,
  }
  await page.locator('.ward-pin').first().hover()
  await page.waitForTimeout(300)
  result.tooltip = await page.locator('.ward-tooltip').innerText().catch(() => '')
  await page.screenshot({ path: 'screenshots/native-ward-map.png', fullPage: false })

  await page.goto('https://dotascope.local/index.html?runtime=desktop#/players/295731192', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.topbar-mode', { timeout: 30000 })
  await page.locator('.topbar-mode-btn', { hasText: 'Turbo' }).click()
  await page.waitForSelector('.benchmark-scopes', { timeout: 30000 })
  await page.waitForTimeout(1200)
  result.scopes = await page.locator('.benchmark-scope').allInnerTexts()
  await page.screenshot({ path: 'screenshots/native-benchmark-personal.png', fullPage: false })

  await page.getByRole('tab', { name: 'Frequent teammates' }).click()
  await page.waitForTimeout(6000)
  result.friendRows = await page.locator('.benchmark-row').count()
  await page.screenshot({ path: 'screenshots/native-benchmark-friends.png', fullPage: false })

  await page.getByRole('tab', { name: 'My games' }).click()
  await page.waitForTimeout(3000)
  result.lobbyRows = await page.locator('.benchmark-row').count()
  await page.screenshot({ path: 'screenshots/native-benchmark-lobby.png', fullPage: false })

  result.errors = errors
  fs.writeFileSync('screenshots/qa-native-ward.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
