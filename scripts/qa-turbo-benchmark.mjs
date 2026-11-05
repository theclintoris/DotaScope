import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.APP_URL || 'http://127.0.0.1:4176'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'screenshots'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath: CHROME })
const issues = []
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
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  screen: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
})
await context.addInitScript((stored) => {
  localStorage.setItem('dotascope.profile.v1', JSON.stringify(stored))
}, storedProfile)
const page = await context.newPage()
page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`))
page.on('console', (msg) => { if (msg.type() === 'error') issues.push(`console: ${msg.text()}`) })

const result = {}

await page.goto(`${BASE}/#/players/295731192`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)
await page.locator('.topbar-mode-btn', { hasText: 'Turbo' }).click()
await page.waitForTimeout(4500)
result.turboBenchmark = await page.evaluate(() => ({
  title: document.querySelector('.performance-review h2')?.textContent?.trim() ?? null,
  eyebrow: document.querySelector('.performance-review .eyebrow')?.textContent?.trim() ?? null,
  score: document.querySelector('.performance-review .review-score-number strong')?.textContent?.trim() ?? null,
  rows: document.querySelectorAll('.performance-review .benchmark-row').length,
  footnote: document.querySelector('.performance-review .panel-footnote')?.textContent?.trim() ?? null,
  reviewVisible: Boolean(document.querySelector('.performance-review')),
}))
await page.screenshot({ path: `${OUT}/turbo-benchmark.png`, fullPage: false })
await page.screenshot({ path: `${OUT}/turbo-benchmark-full.png`, fullPage: true })

await page.locator('.topbar-mode-btn', { hasText: 'Ranked' }).click()
await page.waitForTimeout(4000)
result.rankedBenchmark = await page.evaluate(() => ({
  title: document.querySelector('.performance-review h2')?.textContent?.trim() ?? null,
  rows: document.querySelectorAll('.performance-review .benchmark-row').length,
}))

await page.goto(`${BASE}/#/matches`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.locator('.topbar-mode-btn', { hasText: 'Turbo' }).click()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: /My matches/i }).click()
await page.waitForTimeout(3500)
result.myMatches = await page.evaluate(() => ({
  cards: document.querySelectorAll('.my-match-card').length,
  summary: [...document.querySelectorAll('.summary-strip .kpi-card')].slice(0, 4).map((el) => el.textContent?.trim()),
  modeLabel: document.querySelector('.topbar-mode-btn.is-active')?.textContent?.trim() ?? null,
  navHasLive: Boolean([...document.querySelectorAll('a')].find((a) => a.textContent?.includes('Live suggestions'))),
}))
await page.screenshot({ path: `${OUT}/turbo-history-my-matches.png`, fullPage: false })

await page.goto(`${BASE}/#/live`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
result.liveRemoved = await page.evaluate(() => ({
  hasLiveNav: Boolean([...document.querySelectorAll('a')].find((a) => a.textContent?.includes('Live suggestions'))),
  notFound: document.body.innerText.includes('Lost in the fog') || document.body.innerText.includes('not found') || document.body.innerText.includes('Page not found'),
}))

result.issues = issues
console.log(JSON.stringify(result, null, 2))
await browser.close()
