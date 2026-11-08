const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9265')
  const context = browser.contexts()[0]
  const page = context.pages()[0] || await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('https://dotascope.local/#/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const home = await page.evaluate(() => ({
    url: location.href,
    installButtons: Array.from(document.querySelectorAll('button')).filter((el) => /Install DotaScope/i.test(el.textContent || '')).length,
    apiKeyButtons: Array.from(document.querySelectorAll('button')).filter((el) => /OpenDota API key/i.test((el.textContent || '') + (el.getAttribute('aria-label') || ''))).length,
    text: document.body.innerText.slice(0, 300),
  }))
  await page.screenshot({ path: 'screenshots/prompts-removed-home.png' })

  await page.goto('https://dotascope.local/#/matches/9077882360', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5500)
  const match = await page.evaluate(() => ({
    apiKeyButtons: Array.from(document.querySelectorAll('button')).filter((el) => /API key/i.test((el.textContent || '') + (el.getAttribute('aria-label') || ''))).length,
    installButtons: Array.from(document.querySelectorAll('button')).filter((el) => /Install DotaScope/i.test(el.textContent || '')).length,
    bodyHasAddApiKey: /Add API key/i.test(document.body.innerText),
    bodyHasApiKeyPrompt: /API key/i.test(document.body.innerText),
    title: document.title,
  }))
  await page.screenshot({ path: 'screenshots/prompts-removed-match.png' })

  console.log(JSON.stringify({ home, match, errors }, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
