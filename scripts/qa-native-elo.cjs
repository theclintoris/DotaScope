const { chromium } = require('playwright-core')
const fs = require('fs')

const PORT = process.env.CDP_PORT || '9252'
const storedProfile = {
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

async function main() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await page.goto('https://dotascope.local/index.html?runtime=desktop#/players/295731192', {
    waitUntil: 'domcontentloaded',
  })
  await page.evaluate((profile) => {
    localStorage.setItem('dotascope.profile.v1', JSON.stringify(profile))
  }, storedProfile)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.locator('.topbar-mode-btn', { hasText: 'Turbo' }).click()
  await page.waitForSelector('.turbo-elo-panel', { timeout: 12000 })
  await page.waitForTimeout(1000)

  const result = await page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null
    return {
      title: document.title,
      rating: text('.turbo-elo-rating'),
      rank: text('.turbo-elo-rank'),
      delta: text('.turbo-elo-delta'),
      leaderboardRows: document.querySelectorAll('.turbo-elo-row').length,
      benchHint: text('.performance-review .section-heading-hint'),
      benchmarkTabs: [...document.querySelectorAll('.benchmark-scope')].map((el) => el.textContent?.trim()),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }
  })
  await page.screenshot({ path: 'screenshots/native-elo.png', fullPage: false })
  fs.writeFileSync('screenshots/native-elo.json', JSON.stringify({ result, errors }, null, 2))
  console.log(JSON.stringify({ result, errors }, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
