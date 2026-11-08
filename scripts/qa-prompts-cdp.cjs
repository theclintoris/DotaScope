const fs = require('node:fs')

async function main() {
  const targets = await (await fetch('http://127.0.0.1:9265/json')).json()
  const target = targets.find((entry) => entry.type === 'page')
  if (!target) throw new Error('No CDP page target')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 1
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const job = pending.get(message.id)
    if (!job) return
    pending.delete(message.id)
    if (message.error) job.reject(new Error(message.error.message))
    else job.resolve(message.result)
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return result.result.value
  }

  await new Promise((resolve) => setTimeout(resolve, 2500))
  const home = await evaluate(`(() => ({
    url: location.href,
    installButtons: [...document.querySelectorAll('button')].filter((el) => /Install DotaScope/i.test(el.textContent || '')).length,
    apiKeyButtons: [...document.querySelectorAll('button')].filter((el) => /OpenDota API key/i.test((el.textContent || '') + (el.getAttribute('aria-label') || ''))).length,
    text: document.body.innerText.slice(0, 500)
  }))()`)

  await evaluate(`location.hash = '#/matches/9077882360'`)
  await new Promise((resolve) => setTimeout(resolve, 7000))
  const match = await evaluate(`(() => ({
    url: location.href,
    installButtons: [...document.querySelectorAll('button')].filter((el) => /Install DotaScope/i.test(el.textContent || '')).length,
    apiKeyButtons: [...document.querySelectorAll('button')].filter((el) => /API key/i.test((el.textContent || '') + (el.getAttribute('aria-label') || ''))).length,
    bodyHasAddApiKey: /Add API key/i.test(document.body.innerText),
    bodyHasApiKeyPrompt: /API key/i.test(document.body.innerText),
    apiKeyContexts: [...document.body.innerText.matchAll(/.{0,60}API key.{0,80}/gi)].map((match) => match[0]),
    title: document.title,
    text: document.body.innerText.slice(0, 700)
  }))()`)

  console.log(JSON.stringify({ home, match }, null, 2))
  ws.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
