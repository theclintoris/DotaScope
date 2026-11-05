import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.APP_URL || 'http://127.0.0.1:4176'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'screenshots'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath: CHROME })
const issues = []
const result = {}

async function newPage(viewport, mobile) {
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    userAgent: mobile
      ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
      : undefined,
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`console: ${msg.text()}`)
  })
  return { context, page }
}

// Desktop mode switch
{
  const { context, page } = await newPage({ width: 1440, height: 1100 }, false)
  await page.goto(`${BASE}/#/heroes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  result.desktop = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    active: document.querySelector('.topbar-mode-btn.is-active')?.textContent?.trim() ?? null,
    modeCount: document.querySelectorAll('.topbar-mode-btn').length,
  }))
  await page.screenshot({ path: `${OUT}/mode-switch.png`, fullPage: false })
  await page.locator('.topbar-mode-btn', { hasText: 'Turbo' }).click()
  await page.waitForTimeout(5000)
  result.turbo = await page.evaluate(() => ({
    active: document.querySelector('.topbar-mode-btn.is-active')?.textContent?.trim() ?? null,
    turboLabel: document.querySelector('.hero-table')?.textContent?.includes('Turbo') ?? false,
    population: document.querySelector('.lens-population .is-active')?.textContent?.trim() ?? null,
  }))
  await page.screenshot({ path: `${OUT}/mode-switch-turbo.png`, fullPage: false })
  await context.close()
}

// Mobile topbar
{
  const { context, page } = await newPage({ width: 412, height: 915 }, true)
  await page.goto(`${BASE}/#/heroes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)
  result.mobile = await page.evaluate(() => {
    const actions = document.querySelector('.topbar-actions')?.getBoundingClientRect()
    const mode = document.querySelector('.topbar-mode')?.getBoundingClientRect()
    return {
      viewport: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      topbarMode: mode ? { left: mode.left, right: mode.right, width: mode.width } : null,
      actions: actions ? { left: actions.left, right: actions.right, width: actions.width } : null,
      overflow: Boolean(actions && actions.right > window.innerWidth),
    }
  })
  await page.screenshot({ path: `${OUT}/mode-mobile.png`, fullPage: false })
  await context.close()
}

// Auto-parse watcher: native runtime + synthetic post-game GSI, real worker cache
{
  const { context, page } = await newPage({ width: 1440, height: 1000 }, false)
  await page.route('**/gsi/latest', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        bridge: true,
        available: true,
        receivedAt: new Date().toISOString(),
        payload: {
          provider: { name: 'Dota 2', appid: 570 },
          map: {
            name: 'start',
            matchid: '9077012903',
            game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
            game_time: 1500,
            clock_time: 1500,
          },
          player: { team: 2, name: 'QA', accountid: 1 },
          hero: { id: 5, name: 'npc_dota_hero_venomancer', level: 18 },
          items: { slot0: { name: 'item_blink' } },
          draft: { team2: {}, team3: {} },
        },
      }),
    })
  })
  await page.goto(`${BASE}/?runtime=desktop#/heroes`, { waitUntil: 'domcontentloaded' })
  let toastText = null
  try {
    await page.waitForSelector('.auto-parse-toast', { timeout: 30000 })
    toastText = (await page.locator('.auto-parse-toast').innerText()).replace(/\s+/g, ' ').trim()
    await page.screenshot({ path: `${OUT}/auto-parse-toast.png`, fullPage: false })
  } catch (error) {
    issues.push(`auto-parse toast timeout: ${error.message}`)
  }
  result.autoParse = {
    toastText,
    toastClass: await page.locator('.auto-parse-toast').getAttribute('class').catch(() => null),
  }
  await context.close()
}

await browser.close()
console.log(JSON.stringify({ result, issues }, null, 2))
