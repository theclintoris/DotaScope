const { chromium } = require('playwright-core')
const fs = require('fs')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9243')
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await page.goto('https://dotascope.local/index.html?runtime=desktop#/parser', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.parser-backfill', { timeout: 20000 })
  await page.waitForTimeout(1200)
  await page.click('text=Use latest Turbo sample')
  await page.waitForFunction(() => {
    const field = document.querySelector('#backfill-ids')
    return field && field.value.trim().split(/\s+/).length > 1
  }, { timeout: 30000 })
  const loadedIdCount = (await page.locator('#backfill-ids').inputValue()).trim().split(/\s+/).length

  await page.fill('#backfill-ids', '9077012903\n9074125467')
  await page.click('text=Start queue')
  await page.waitForFunction(() => {
    const pill = document.querySelector('.parser-backfill-pill')
    return pill && /Queue (complete|cancelled)/.test(pill.textContent ?? '')
  }, { timeout: 60000 })
  await page.waitForTimeout(800)

  const result = {
    loadedIdCount,
    pill: await page.locator('.parser-backfill-pill').innerText(),
    progress: await page.locator('.parser-backfill-progress-head strong').innerText(),
    results: await page.locator('.parser-backfill-result').allInnerTexts(),
    worker: await page.locator('.parser-status-pill').innerText(),
    errors,
  }
  await page.screenshot({ path: 'screenshots/native-parser-backfill.png', fullPage: false })
  fs.writeFileSync('screenshots/native-parser-backfill.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
