import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createReplayCollector } from './replay-collector.mjs'

test('Turbo collection retries across worker restarts and deduplicates completed replays', async () => {
  mkdirSync('worker/data', { recursive: true })
  const directory = mkdtempSync('worker/data/collector-test-')
  try {
    const file = join(directory, 'collector.json')
    let clock = Date.UTC(2026, 10, 18)
    let attempts = 0
    const options = {
      file,
      now: () => clock,
      coordinator: () => 'linked',
      discover: async () => [
        { matchId: '12345', endedAt: clock - 1000 },
        { matchId: '12345', endedAt: clock - 1000 },
        { matchId: '12344', endedAt: clock - 4 * 86_400_000 },
      ],
      parse: async (id) => {
        assert.equal(id, '12345')
        if (++attempts === 1) throw new Error('Waiting for Valve')
        return { skipped: false }
      },
    }
    let collector = createReplayCollector(options)
    collector.configure({ accountId: 123 })
    await collector.scan()
    assert.equal(collector.status().pending, 1)
    await collector.process()
    assert.equal(collector.status().entries[0].status, 'waiting')

    collector = createReplayCollector(options)
    assert.equal(collector.status().accountId, 123)
    await collector.process()
    assert.equal(attempts, 1)
    clock += 60_000
    collector.configure({ paused: true })
    await collector.process()
    assert.equal(attempts, 1)
    collector.configure({ paused: false })
    await collector.process()
    assert.equal(collector.status().entries[0].status, 'parsed')
    assert.equal(collector.status().pending, 0)
    await collector.scan()
    await collector.process()
    assert.equal(attempts, 2)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
