const { chromium } = require('playwright-core')
const fs = require('fs')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = JSON.parse(fs.readFileSync('.tmp-player.json', 'utf8'))
const BASE = 'http://localhost:4179'

async function seed(context) {
  await context.addInitScript(({ profile }) => {
    localStorage.setItem('dotascope.profile.v1', JSON.stringify({
      accountId: 295731192, profile, winLoss: null, savedAt: Date.now(),
    }))
    localStorage.setItem('dotascope.population.v1', JSON.stringify('ranked'))
  }, { profile })
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  await seed(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

  await page.goto(`${BASE}/#/records`)
  await page.waitForSelector('.personal-record-card', { timeout: 15000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'screenshots/records-personal-ranked-final.png' })
  const ranked = await page.evaluate(() => ({
    cards: document.querySelectorAll('.personal-record-card').length,
    columns: getComputedStyle(document.querySelector('.personal-record-grid')).gridTemplateColumns,
    mode: document.querySelector('.personal-record-mode .is-active')?.textContent?.trim(),
  }))
  await page.selectOption('.personal-record-hero', '35')
  await page.waitForTimeout(500)
  const rankedSniper = await page.evaluate(() => ({
    cards: document.querySelectorAll('.personal-record-card').length,
    allSniper: [...document.querySelectorAll('.personal-record-meta')].every((el) => el.textContent?.includes('Sniper')),
    heading: document.querySelector('.personal-records .section-heading')?.innerText.replace(/\n/g, ' | '),
  }))

  await page.locator('.personal-record-mode button', { hasText: 'Turbo' }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'screenshots/records-personal-turbo-final.png' })
  const turbo = await page.evaluate(() => ({
    cards: document.querySelectorAll('.personal-record-card').length,
    columns: getComputedStyle(document.querySelector('.personal-record-grid')).gridTemplateColumns,
    winCards: [...document.querySelectorAll('.personal-record-card')].filter((el) => el.textContent?.includes('win')).map((el) => el.innerText.replace(/\n/g, ' | ')),
  }))

  const mobile = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, deviceScaleFactor: 1 })
  await seed(mobile)
  const mp = await mobile.newPage()
  const mobileErrors = []
  mp.on('pageerror', (error) => mobileErrors.push(error.message))
  mp.on('console', (message) => { if (message.type() === 'error') mobileErrors.push(message.text()) })
  await mp.goto(`${BASE}/#/records`)
  await mp.waitForTimeout(3000)
  await mp.screenshot({ path: 'screenshots/records-personal-mobile-final.png', fullPage: false })
  const mobileStats = await mp.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    columns: getComputedStyle(document.querySelector('.personal-record-grid')).gridTemplateColumns,
    cards: document.querySelectorAll('.personal-record-card').length,
  }))
  console.log(JSON.stringify({ ranked, rankedSniper, turbo, mobile: mobileStats, errors, mobileErrors }, null, 2))
  await browser.close()
}
main().catch((error) => { console.error(error); process.exit(1) })
