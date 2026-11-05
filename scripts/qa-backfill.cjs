const { chromium } = require('playwright-core')
const fs = require('fs')

const BASE = 'http://127.0.0.1:4176'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await page.goto(`${BASE}/#/parser`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.setItem('dotascope.profile.v1', JSON.stringify({
      accountId: 295731192,
      profile: { profile: { personaname: 'Lemongrab', account_id: 295731192 } },
      winLoss: null,
      savedAt: Date.now(),
    }))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.parser-backfill', { timeout: 20000 })
  await page.waitForTimeout(1000)

  const heading = await page.locator('.parser-backfill h2').innerText()
  const idlePill = await page.locator('.parser-backfill-pill').innerText()
  await page.click('text=Use latest Turbo sample')
  await page.waitForFunction(() => {
    const field = document.querySelector('#backfill-ids')
    return field && field.value.trim().split(/\s+/).length > 1
  }, { timeout: 30000 })
  const loadedIds = await page.locator('#backfill-ids').inputValue()

  await page.fill('#backfill-ids', '9077012903\n9074125467')
  await page.click('text=Start queue')
  await page.waitForFunction(() => {
    const pill = document.querySelector('.parser-backfill-pill')
    return pill && /Queue (complete|cancelled)/.test(pill.textContent ?? '')
  }, { timeout: 60000 })
  await page.waitForTimeout(700)

  const completePill = await page.locator('.parser-backfill-pill').innerText()
  const results = await page.locator('.parser-backfill-result').allInnerTexts()
  const progress = await page.locator('.parser-backfill-progress-head strong').innerText()
  await page.screenshot({ path: 'screenshots/parser-backfill.png', fullPage: false })

  await page.setViewportSize({ width: 412, height: 915 })
  await page.waitForTimeout(500)
  const innerWidth = await page.evaluate(() => window.innerWidth)
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  await page.screenshot({ path: 'screenshots/parser-backfill-mobile.png', fullPage: false })

  await browser.close()
  fs.writeFileSync('screenshots/parser-backfill-result.json', JSON.stringify({
    heading,
    idlePill,
    loadedIdCount: loadedIds.split(/\s+/).filter(Boolean).length,
    completePill,
    progress,
    results,
    innerWidth,
    scrollWidth,
    errors,
  }, null, 2))
  console.log(JSON.stringify({ heading, idlePill, loadedIdCount: loadedIds.split(/\s+/).filter(Boolean).length, completePill, progress, results, innerWidth, scrollWidth, errors }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
