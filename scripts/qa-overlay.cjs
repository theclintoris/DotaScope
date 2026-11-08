const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9266')
  const pages = browser.contexts().flatMap((context) => context.pages())
  const page = pages.find((entry) => entry.url().includes('/overlay')) || pages[0]
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForTimeout(5000)
  const info = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    text: document.body.innerText,
    width: window.innerWidth,
    height: window.innerHeight,
    cards: document.querySelectorAll('.overlay-card').length,
    heroes: document.querySelectorAll('.overlay-pick').length,
    scrollWidth: document.body.scrollWidth,
  }))
  await page.screenshot({ path: 'screenshots/overlay-desktop.png', fullPage: false })
  console.log(JSON.stringify({ info, errors }, null, 2))
  await browser.close()
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
