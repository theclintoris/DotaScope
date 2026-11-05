const { chromium } = require('playwright-core')
const fs = require('fs')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = JSON.parse(fs.readFileSync('.tmp-player.json', 'utf8'))
const BASE = 'http://localhost:4179'

async function seed(context) {
  await context.addInitScript(({ profile }) => {
    localStorage.setItem('dotascope.profile.v1', JSON.stringify({
      accountId: 295731192,
      profile,
      winLoss: null,
      savedAt: Date.now(),
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
  await page.waitForSelector('.personal-records', { timeout: 10000 })
  await page.waitForTimeout(7000)
  await page.screenshot({ path: 'screenshots/records-personal-ranked.png', fullPage: false })
  const ranked = await page.evaluate(() => ({
    mode: document.querySelector('.personal-record-mode .is-active')?.textContent?.trim(),
    cards: [...document.querySelectorAll('.personal-record-card')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    hint: document.querySelector('.personal-records .section-heading')?.innerText.replace(/\n/g, ' | '),
  }))

  await page.locator('.personal-record-mode button', { hasText: 'Turbo' }).click()
  await page.waitForTimeout(6000)
  await page.screenshot({ path: 'screenshots/records-personal-turbo.png', fullPage: false })
  const turbo = await page.evaluate(() => ({
    mode: document.querySelector('.personal-record-mode .is-active')?.textContent?.trim(),
    cards: [...document.querySelectorAll('.personal-record-card')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    hint: document.querySelector('.personal-records .section-heading')?.innerText.replace(/\n/g, ' | '),
  }))

  await page.selectOption('.personal-record-hero', '35')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'screenshots/records-personal-turbo-sniper.png', fullPage: false })
  const sniper = await page.evaluate(() => ({
    hero: (document.querySelector('.personal-record-hero') ).value,
    cards: [...document.querySelectorAll('.personal-record-card')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    hint: document.querySelector('.personal-records .section-heading')?.innerText.replace(/\n/g, ' | '),
  }))

  const mobile = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, deviceScaleFactor: 1 })
  await seed(mobile)
  const mobilePage = await mobile.newPage()
  const mobileErrors = []
  mobilePage.on('pageerror', (error) => mobileErrors.push(error.message))
  mobilePage.on('console', (message) => { if (message.type() === 'error') mobileErrors.push(message.text()) })
  await mobilePage.goto(`${BASE}/#/records`)
  await mobilePage.waitForTimeout(7000)
  await mobilePage.screenshot({ path: 'screenshots/records-personal-mobile.png', fullPage: true })
  const mobileMetrics = await mobilePage.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    cards: document.querySelectorAll('.personal-record-card').length,
    panel: Boolean(document.querySelector('.personal-records')),
  }))

  console.log(JSON.stringify({ ranked, turbo, sniper, mobile: mobileMetrics, errors, mobileErrors }, null, 2))
  await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
