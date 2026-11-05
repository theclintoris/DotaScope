const { chromium } = require('playwright-core')
const fs = require('fs')

async function createPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return { context, page, errors }
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const result = {}

  const desktop = await createPage(browser, { width: 1440, height: 1100 })
  await desktop.page.goto('http://127.0.0.1:4180/#/matches/9077789924', { waitUntil: 'domcontentloaded' })
  await desktop.page.waitForSelector('.ward-map-panel', { timeout: 30000 })
  await desktop.page.waitForTimeout(900)
  const pins = desktop.page.locator('.ward-pin')
  result.wards = {
    pins: await pins.count(),
    legend: await desktop.page.locator('.ward-map-counts').innerText().catch(() => ''),
  }
  await pins.first().hover()
  await desktop.page.waitForTimeout(300)
  result.wards.tooltip = await desktop.page.locator('.ward-tooltip').innerText().catch(() => '')
  await desktop.page.screenshot({ path: 'screenshots/ward-map-desktop.png', fullPage: false })
  await desktop.page.getByRole('button', { name: /^Sentries/ }).click()
  await desktop.page.waitForTimeout(200)
  result.wards.afterSentry = await desktop.page.locator('.ward-pin').count()
  await desktop.page.screenshot({ path: 'screenshots/ward-map-sentry.png', fullPage: false })

  await desktop.page.goto('http://127.0.0.1:4180/#/players/295731192', { waitUntil: 'domcontentloaded' })
  await desktop.page.waitForSelector('.topbar-mode', { timeout: 30000 })
  await desktop.page.locator('.topbar-mode-btn', { hasText: 'Turbo' }).click()
  await desktop.page.waitForSelector('.benchmark-scopes', { timeout: 30000 })
  await desktop.page.waitForTimeout(1500)
  result.personal = {
    scopes: await desktop.page.locator('.benchmark-scope').allInnerTexts(),
    rows: await desktop.page.locator('.benchmark-row').count(),
    title: await desktop.page.locator('.review-score-number strong').innerText().catch(() => ''),
  }
  await desktop.page.screenshot({ path: 'screenshots/benchmark-personal.png', fullPage: false })

  await desktop.page.getByRole('tab', { name: 'Frequent teammates' }).click()
  await desktop.page.waitForTimeout(5000)
  result.friends = {
    status: await desktop.page.locator('.benchmark-scope-status').innerText().catch(() => ''),
    rows: await desktop.page.locator('.benchmark-row').count(),
    sample: await desktop.page.locator('.benchmark-scope-note').innerText().catch(() => ''),
  }
  await desktop.page.screenshot({ path: 'screenshots/benchmark-friends.png', fullPage: false })

  await desktop.page.getByRole('tab', { name: 'My games' }).click()
  await desktop.page.waitForTimeout(3000)
  result.lobby = {
    status: await desktop.page.locator('.benchmark-scope-status').innerText().catch(() => ''),
    rows: await desktop.page.locator('.benchmark-row').count(),
    score: await desktop.page.locator('.review-score-number strong').innerText().catch(() => ''),
  }
  await desktop.page.screenshot({ path: 'screenshots/benchmark-lobby.png', fullPage: false })
  result.desktopErrors = desktop.errors
  await desktop.context.close()

  const mobile = await createPage(browser, { width: 412, height: 915 })
  await mobile.page.goto('http://127.0.0.1:4180/#/matches/9077789924', { waitUntil: 'domcontentloaded' })
  await mobile.page.waitForSelector('.ward-map-panel', { timeout: 30000 })
  await mobile.page.locator('.ward-map-panel').scrollIntoViewIfNeeded()
  await mobile.page.waitForTimeout(800)
  result.mobile = {
    innerWidth: await mobile.page.evaluate(() => window.innerWidth),
    scrollWidth: await mobile.page.evaluate(() => document.body.scrollWidth),
    pins: await mobile.page.locator('.ward-pin').count(),
  }
  await mobile.page.screenshot({ path: 'screenshots/ward-map-mobile.png', fullPage: false })
  result.mobileErrors = mobile.errors
  await mobile.context.close()

  await browser.close()
  fs.writeFileSync('screenshots/qa-ward-bench.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
