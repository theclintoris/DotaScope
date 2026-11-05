const { chromium } = require('playwright-core')
const fs = require('fs')

const BASE = process.env.APP_URL || 'http://127.0.0.1:4181'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const profile = {
  accountId: 295731192,
  profile: {
    profile: {
      account_id: 295731192,
      personaname: 'Lemongrab',
      name: null,
      avatarfull: 'https://avatars.steamstatic.com/0000000000000000000000000000000000000000_full.jpg',
      profileurl: 'https://steamcommunity.com/id/lemongrab',
      last_login: null,
      loccountrycode: 'NZ',
      is_contributor: false,
      is_subscriber: false,
    },
    rank_tier: 34,
    leaderboard_rank: null,
    computed_mmr: 3864,
    computed_mmr_turbo: 4037,
  },
  winLoss: null,
  savedAt: Date.now(),
}

async function run(viewport, name) {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME })
  const context = await browser.newContext({ viewport, screen: viewport, deviceScaleFactor: 1 })
  await context.addInitScript((stored) => {
    localStorage.setItem('dotascope.profile.v1', JSON.stringify(stored))
  }, profile)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await page.goto(`${BASE}/#/players/295731192`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.locator('.topbar-mode-btn', { hasText: 'Turbo' }).click()
  await page.waitForSelector('.turbo-elo-panel', { timeout: 12000 })
  await page.waitForTimeout(1200)

  const panel = await page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null
    const benchmark = document.querySelector('.performance-review')
    return {
      rating: text('.turbo-elo-rating'),
      rank: text('.turbo-elo-rank'),
      delta: text('.turbo-elo-delta'),
      meta: text('.turbo-elo-meta'),
      leaderboardRows: document.querySelectorAll('.turbo-elo-row').length,
      names: [...document.querySelectorAll('.turbo-elo-name a, .turbo-elo-name > span')].slice(0, 7).map((el) => el.textContent?.trim()),
      note: text('.turbo-elo-note'),
      benchmarkHint: text('.performance-review .section-heading-hint') ?? text('.performance-review .section-heading p'),
      benchmarkTabs: [...document.querySelectorAll('.benchmark-scope')].map((el) => el.textContent?.trim()),
      benchmarkTitle: benchmark?.querySelector('h2')?.textContent?.trim() ?? null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }
  })
  await page.screenshot({ path: `screenshots/elo-panel-${name}.png`, fullPage: false })
  await page.screenshot({ path: `screenshots/elo-panel-${name}-full.png`, fullPage: true })
  await browser.close()
  return { panel, errors }
}

async function main() {
  const desktop = await run({ width: 1440, height: 1100 }, 'desktop')
  const mobile = await run({ width: 412, height: 915 }, 'mobile')
  const result = { ...desktop, mobile, }
  fs.writeFileSync('screenshots/elo-qa.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
