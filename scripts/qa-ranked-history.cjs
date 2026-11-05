const { chromium } = require('playwright-core')
const fs = require('fs')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = JSON.parse(fs.readFileSync('.tmp-player.json', 'utf8'))
const BASE = 'http://localhost:4180'

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
  await page.waitForSelector('.personal-record-card', { timeout: 20000 })
  await page.waitForFunction(() => document.querySelectorAll('.personal-record-card').length >= 10, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)
  const ranked = await page.evaluate(() => ({
    cards: document.querySelectorAll('.personal-record-card').length,
    heading: document.querySelector('.personal-records .section-heading')?.innerText.replace(/\n/g, ' | '),
    labels: [...document.querySelectorAll('.personal-record-card-head span:nth-child(2)')].map((el) => el.textContent?.trim()),
    mode: document.querySelector('.personal-record-mode .is-active')?.textContent?.trim(),
  }))
  ranked.parsedHistory = await page.evaluate(() => fetch('http://127.0.0.1:5601/ranked-history?accountId=295731192&limit=5').then((r) => r.json()).then((j) => j.count).catch(() => -1))
  await page.screenshot({ path: 'screenshots/records-personal-ranked-parsed.png' })
  console.log(JSON.stringify({ ranked, errors }, null, 2))
  await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
