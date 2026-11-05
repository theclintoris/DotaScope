import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'screenshots'

await mkdir(OUT, { recursive: true })

const issues = []
const contexts = new Map()

async function getContext(viewport, mobile) {
  const key = mobile ? 'mobile' : 'desktop'
  let context = contexts.get(key)
  if (!context) {
    context = await browser.newContext({
      viewport,
      screen: viewport,
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
      userAgent: mobile
        ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
        : undefined,
    })
    contexts.set(key, context)
  }
  return context
}

async function runPage({ name, route, viewport, mobile = false, wait = 4500, after, fullPage = false }) {
  const context = await getContext(viewport, mobile)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || 'failed'
    if (!failure.includes('ERR_ABORTED')) {
      errors.push(`request: ${request.url()} ${failure}`)
    }
  })

  await page.goto(`${BASE}/#${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(wait)
  if (after) await after(page)

  const layout = await page.evaluate(() => {
    const wide = [...document.querySelectorAll('body *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 1 && rect.right > window.innerWidth + 2
      })
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        cls: String(element.className).slice(0, 90),
        width: Math.round(element.getBoundingClientRect().width),
        right: Math.round(element.getBoundingClientRect().right),
      }))
    return {
      title: document.title,
      viewport: [window.innerWidth, window.innerHeight],
      page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      wide,
    }
  })

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
  await page.close()

  const record = { name, route, layout, errors: [...new Set(errors)] }
  issues.push(record)
  console.log(JSON.stringify(record))

  if (layout.overflow) {
    console.warn(`OVERFLOW ${name}: ${layout.page[0]} > ${layout.viewport[0]}`)
  }
}

const heroResponse = await fetch('https://api.opendota.com/api/heroStats').then((response) => response.json())
const wraithKing = heroResponse.find((hero) => hero.localized_name === 'Wraith King') || heroResponse[0]
const proMatches = await fetch('https://api.opendota.com/api/proMatches').then((response) => response.json())
const matchId = proMatches[0]?.match_id || 8_000_000_000

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
})

try {
  const desktop = { width: 1440, height: 1100 }
  const mobile = { width: 412, height: 915 }

  await runPage({ name: 'desktop-overview', route: '/', viewport: desktop, wait: 5000 })
  await runPage({ name: 'desktop-heroes', route: '/heroes', viewport: desktop, wait: 4000 })
  await runPage({
    name: 'desktop-hero-detail',
    route: `/heroes/${wraithKing.id}`,
    viewport: desktop,
    wait: 5500,
    fullPage: true,
  })
  await runPage({ name: 'desktop-matches', route: '/matches', viewport: desktop, wait: 4500 })
  await runPage({
    name: 'desktop-match-detail',
    route: `/matches/${matchId}`,
    viewport: desktop,
    wait: 5500,
    fullPage: true,
  })
  await runPage({ name: 'desktop-players', route: '/players', viewport: desktop, wait: 4500 })
  await runPage({
    name: 'desktop-player-detail',
    route: '/players/295731192',
    viewport: desktop,
    wait: 5500,
  })
  await runPage({ name: 'desktop-pro', route: '/pro', viewport: desktop, wait: 4500 })
  await runPage({ name: 'desktop-records', route: '/records', viewport: desktop, wait: 4500 })
  await runPage({ name: 'desktop-data-lab', route: '/data-lab', viewport: desktop, wait: 3500 })
  await runPage({
    name: 'desktop-command-palette',
    route: '/heroes',
    viewport: desktop,
    wait: 3000,
    after: async (page) => {
      await page.keyboard.press('Control+k')
      await page.waitForSelector('.command-panel', { timeout: 5000 })
      await page.keyboard.type('wraith')
      await page.waitForTimeout(800)
    },
  })

  await runPage({
    name: 'mobile-overview',
    route: '/',
    viewport: mobile,
    mobile: true,
    wait: 5000,
  })
  await runPage({
    name: 'mobile-heroes',
    route: '/heroes',
    viewport: mobile,
    mobile: true,
    wait: 4000,
  })
  await runPage({
    name: 'mobile-player',
    route: '/players/295731192',
    viewport: mobile,
    mobile: true,
    wait: 5500,
  })
  await runPage({
    name: 'mobile-matches',
    route: '/matches',
    viewport: mobile,
    mobile: true,
    wait: 4000,
  })
  await runPage({
    name: 'mobile-hero-detail',
    route: `/heroes/${wraithKing.id}`,
    viewport: mobile,
    mobile: true,
    wait: 4500,
  })
  await runPage({
    name: 'mobile-match-detail',
    route: `/matches/${matchId}`,
    viewport: mobile,
    mobile: true,
    wait: 5000,
    fullPage: true,
  })
  await runPage({
    name: 'mobile-more-menu',
    route: '/',
    viewport: mobile,
    mobile: true,
    wait: 3500,
    after: async (page) => {
      await page.locator('.menu-btn').click()
      await page.waitForSelector('.mobile-sheet', { timeout: 5000 })
      await page.waitForTimeout(400)
    },
  })

  await runPage({
    name: 'desktop-data-lab-result',
    route: '/data-lab',
    viewport: desktop,
    wait: 3000,
    after: async (page) => {
      await page.getByRole('button', { name: /run query/i }).click()
      await page.waitForSelector('.result-table', { timeout: 40000 })
      await page.waitForTimeout(400)
    },
  })
} finally {
  await browser.close()
}

console.log(`\n${issues.length} pages checked`)
const broken = issues.filter((issue) => issue.errors.length || issue.layout.overflow)
if (broken.length) {
  console.log(`\n${broken.length} issues worth reviewing:`)
  for (const issue of broken) {
    console.log(`- ${issue.name}: overflow=${issue.layout.overflow} errors=${issue.errors.length}`)
    for (const error of issue.errors) console.log(`    ${error}`)
  }
} else {
  console.log('No console errors or horizontal document overflow detected.')
}
