import { readFileSync, renameSync, writeFileSync } from 'node:fs'

const MINUTE = 60_000
const WINDOW = 3 * 24 * 60 * MINUTE
const RETRY = [MINUTE, 5 * MINUTE, 30 * MINUTE, 120 * MINUTE, 360 * MINUTE]
const terminal = new Set(['parsed', 'skipped', 'unavailable'])

export function createReplayCollector({ file, discover, parse, coordinator, now = Date.now }) {
  let state = { accountId: null, paused: false, entries: [] }
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    if (Array.isArray(saved?.entries)) state = saved
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read the replay collector queue:', error.message)
  }

  let nextScan = 0
  let lastScan = null
  let scanError = null
  let scanning = false
  let current = null

  function save(next) {
    writeFileSync(file + '.tmp', JSON.stringify(next))
    renameSync(file + '.tmp', file)
    state = next
  }

  function configure({ accountId = state.accountId, paused = state.paused }) {
    if (accountId === state.accountId && paused === state.paused) return
    save({ ...state, accountId, paused })
    nextScan = 0
    lastScan = null
    scanError = null
  }

  function status() {
    const entries = state.entries.filter((row) => row.accountId === state.accountId)
    const pending = entries.filter((row) => !terminal.has(row.status))
    return {
      accountId: state.accountId,
      paused: state.paused,
      coordinator: coordinator(),
      lastScan,
      scanError,
      pending: pending.length,
      current: current?.accountId === state.accountId ? current.matchId : null,
      entries: [...entries].sort((a, b) => b.endedAt - a.endedAt).slice(0, 12),
    }
  }

  async function scan() {
    const accountId = state.accountId
    if (!accountId || state.paused || scanning || now() < nextScan) return
    scanning = true
    nextScan = now() + 30 * MINUTE
    try {
      const matches = await discover(accountId)
      if (accountId !== state.accountId || state.paused) return
      const cutoff = now() - WINDOW
      const entries = state.entries.filter((row) => row.endedAt >= cutoff - WINDOW || !terminal.has(row.status))
      const known = new Set(entries.filter((row) => row.accountId === accountId).map((row) => row.matchId))
      for (const { matchId, endedAt } of matches) {
        if (!/^\d{1,20}$/.test(matchId) || !Number.isFinite(endedAt) || endedAt < cutoff || endedAt > now() || known.has(matchId)) continue
        known.add(matchId)
        entries.push({ accountId, matchId, endedAt, attempts: 0, retryAt: now(), status: 'queued' })
      }
      save({ ...state, entries })
      lastScan = now()
      scanError = null
    } catch (error) {
      if (accountId === state.accountId) scanError = error.message
    } finally {
      scanning = false
    }
  }

  async function process() {
    if (state.paused || current || !state.accountId) return
    const due = state.entries.filter((row) => row.accountId === state.accountId && !terminal.has(row.status))
    const expired = due.filter((row) => now() - row.endedAt > WINDOW)
    if (expired.length) {
      const expiredSet = new Set(expired)
      save({ ...state, entries: state.entries.map((row) => expiredSet.has(row) ? { ...row, status: 'unavailable' } : row) })
    }
    const row = due.filter((entry) => !expired.includes(entry) && entry.retryAt <= now())
      .sort((a, b) => b.endedAt - a.endedAt)[0]
    if (!row) return
    current = row
    let update
    try {
      const result = await parse(row.matchId)
      update = { status: result.skipped ? 'skipped' : 'parsed', message: result.skipped ? 'Match was not Turbo.' : null }
    } catch (error) {
      const attempts = row.attempts + 1
      const retryAt = Math.min(now() + RETRY[Math.min(attempts - 1, RETRY.length - 1)], row.endedAt + WINDOW + 1)
      update = { status: 'waiting', attempts, retryAt, message: error.message }
    }
    try {
      save({ ...state, entries: state.entries.map((entry) => entry === row ? { ...entry, ...update } : entry) })
    } finally {
      current = null
    }
  }

  return { configure, status, scan, process, wake: () => { nextScan = 0 } }
}
