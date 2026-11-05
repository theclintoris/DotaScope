const { chromium } = require('playwright-core')
const fs = require('fs')
const profile = JSON.parse(fs.readFileSync('.tmp-player.json', 'utf8'))

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9246')
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

  await page.goto('https://dotascope.local/index.html?runtime=desktop#/records', { waitUntil: 'domcontentloaded' })
  await page.evaluate((profile) => {
    if (!localStorage.getItem('dotascope.profile.v1')) {
      localStorage.setItem('dotascope.profile.v1', JSON.stringify({
        accountId: 295731192, profile, winLoss: null, savedAt: Date.now(),
      }))
    }
    localStorage.setItem('dotascope.population.v1', JSON.stringify('ranked'))
  }, profile)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.personal-records', { timeout: 20000 })
  await page.waitForTimeout(7000)
  await page.screenshot({ path: 'screenshots/native-records-ranked.png', fullPage: false })
  const ranked = await page.evaluate(() => ({
    cards: document.querySelectorAll('.personal-record-card').length,
    heading: document.querySelector('.personal-records .section-heading')?.innerText.replace(/\n/g, ' | '),
    mode: document.querySelector('.personal-record-mode .is-active')?.textContent?.trim(),
  }))

  await page.locator('.personal-record-mode button', { hasText: 'Turbo' }).click()
  await page.waitForTimeout(3500)
  await page.screenshot({ path: 'screenshots/native-records-turbo.png', fullPage: false })
  const turbo = await page.evaluate(() => ({
    cards: document.querySelectorAll('.personal-record-card').length,
    mode: document.querySelector('.personal-record-mode .is-active')?.textContent?.trim(),
  }))

  console.log(JSON.stringify({ ranked, turbo, errors }, null, 2))
  await browser.close()
}
main().catch((error) => { console.error(error); process.exit(1) })
