#!/usr/bin/env node
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const PORT = Number(process.env.PARSER_WORKER_PORT ?? 5601)
const PARSER_URL = process.env.OPENDOTA_PARSER_URL ?? 'http://127.0.0.1:5600'
const API_BASE = 'https://api.opendota.com/api'
const ROOT = process.cwd()
const DATA_DIR = resolve(process.env.PARSER_DATA_DIR ?? join(ROOT, 'worker', 'data'))
const DEFAULT_REPLAY_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta\\game\\dota\\replays'
const REPLAY_DIR = resolve(process.env.DOTA_REPLAY_DIR ?? DEFAULT_REPLAY_DIR)
const JAVA_BIN = process.env.JAVA_BIN ?? join(ROOT, '.toolchain', 'jdk-21.0.13+9', 'bin', 'java.exe')
const PARSER_JAR = process.env.OPENDOTA_PARSER_JAR ?? join(ROOT, '.toolchain', 'odota-parser', 'target', 'stats-0.1.0.jar')
const SEVEN_ZIP_BIN = process.env.SEVEN_ZIP_BIN ?? 'C:\\Program Files\\7-Zip\\7z.exe'
const JAVA_TMP_DIR = join(DATA_DIR, 'java-tmp')
const TURBO_HISTORY_PATH = join(DATA_DIR, 'turbo-history.json')
const RANKED_HISTORY_PATH = join(DATA_DIR, 'ranked-history.json')
const TURBO_ELO_PATH = join(DATA_DIR, 'turbo-elo.json')
const ELO_BASELINE = 1000
const ELO_K = 32
const ELO_MAX_HISTORY = 200

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(JAVA_TMP_DIR, { recursive: true })

let parserProcess = null
let parserStarting = null

const MODE_NAMES = {
  1: 'All Pick', 2: 'Captains Mode', 3: 'Random Draft', 4: 'Single Draft',
  5: 'All Random', 16: 'Captains Draft', 18: 'Ability Draft', 20: 'All Random Deathmatch',
  22: 'All Draft', 23: 'Turbo',
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  res.end(payload)
}

function safeId(value) {
  const id = String(value ?? '')
  if (!/^\d{1,20}$/.test(id)) throw new Error('Invalid match id')
  return id
}

function replayPath(matchId) {
  const exact = join(REPLAY_DIR, `${matchId}.dem`)
  if (existsSync(exact)) return exact
  return null
}

function listReplays() {
  if (!existsSync(REPLAY_DIR)) return []
  return readdirSync(REPLAY_DIR)
    .filter((name) => name.toLowerCase().endsWith('.dem'))
    .map((name) => {
      const path = join(REPLAY_DIR, name)
      const stat = statSync(path)
      return {
        matchId: name.slice(0, -4),
        name,
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

async function parserHealthy() {
  try {
    const res = await fetch(PARSER_URL, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function ensureParser() {
  if (await parserHealthy()) return true
  if (parserStarting) return parserStarting
  if (!existsSync(PARSER_JAR) || !existsSync(JAVA_BIN)) {
    throw new Error(`OpenDota parser is not available. Expected Java at ${JAVA_BIN} and jar at ${PARSER_JAR}.`)
  }
  parserStarting = new Promise((resolvePromise, reject) => {
    const child = spawn(JAVA_BIN, [`-Djava.io.tmpdir=${JAVA_TMP_DIR}`, '-jar', PARSER_JAR], {
      cwd: ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    parserProcess = child
    let settled = false
    const finish = (ok, error) => {
      if (settled) return
      settled = true
      parserStarting = null
      if (ok) resolvePromise(true)
      else reject(error)
    }
    child.stdout.on('data', (chunk) => process.stderr.write(`[parser] ${chunk}`))
    child.stderr.on('data', (chunk) => process.stderr.write(`[parser] ${chunk}`))
    child.on('error', (error) => finish(false, error))
    child.on('exit', (code) => {
      parserProcess = null
      if (!settled) finish(false, new Error(`Parser exited with code ${code}`))
    })
    const started = Date.now()
    const poll = async () => {
      if (await parserHealthy()) return finish(true)
      if (Date.now() - started > 30000) return finish(false, new Error('Parser did not start within 30 seconds'))
      setTimeout(poll, 500)
    }
    setTimeout(poll, 500)
  })
  return parserStarting
}

async function openDotaMatch(matchId) {
  try {
    const res = await fetch(`${API_BASE}/matches/${matchId}`, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function teamOf(slot) {
  return slot < 5 ? 'radiant' : 'dire'
}

function asNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function decodeProtobufString(value) {
  if (!value || !Array.isArray(value.bytes)) return ''
  return Buffer.from(value.bytes.map((byte) => byte & 0xff)).toString('utf8').replace(/\0+$/, '')
}

function accountIdFromSteamId(steamId) {
  if (steamId == null) return null
  try {
    const value = BigInt(steamId)
    const base = 76561197960265728n
    if (value <= base) return null
    return Number(value - base)
  } catch {
    return null
  }
}

async function summarise(rawPath, matchId) {
  const last = new Map()
  const timelineBuckets = new Map()
  const playerSlots = new Map()
  const epiloguePlayers = []
  const wardEvents = []
  const wardRemovals = new Map()
  let epilogueDota = null
  let lineCount = 0

  const rl = createInterface({ input: createReadStream(rawPath), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line) continue
    lineCount += 1
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.type === 'player_slot') {
      playerSlots.set(Number(row.key), asNumber(row.value))
    } else if (row.type === 'epilogue') {
      try {
        const epilogue = JSON.parse(row.key)
        epilogueDota = epilogue?.gameInfo_?.dota_ ?? null
        const info = epilogueDota?.playerInfo_
        if (Array.isArray(info)) {
          info.forEach((player, slot) => {
            const gameTeam = asNumber(player.gameTeam_)
            epiloguePlayers[slot] = {
              slot,
              accountId: accountIdFromSteamId(player.steamid_),
              personaname: decodeProtobufString(player.playerName_) || null,
              steamId: player.steamid_ == null ? null : String(player.steamid_),
              team: gameTeam === 2 ? 'radiant' : gameTeam === 3 ? 'dire' : teamOf(slot),
            }
          })
        }
      } catch {
        // The interval data is still enough for a useful summary.
      }
    } else if (row.type === 'interval' && Number.isFinite(row.slot)) {
      const previous = last.get(row.slot)
      if (!previous || asNumber(row.time) >= asNumber(previous.time)) last.set(row.slot, row)
      const time = asNumber(row.time)
      if (time >= 0) {
        const bucket = Math.floor(time / 60)
        let entries = timelineBuckets.get(bucket)
        if (!entries) {
          entries = new Map()
          timelineBuckets.set(bucket, entries)
        }
        const previousEntry = entries.get(row.slot)
        if (!previousEntry || time >= asNumber(previousEntry.time)) entries.set(row.slot, row)
      }
    } else if ((row.type === 'obs' || row.type === 'sen') && Number.isFinite(row.slot)) {
      wardEvents.push({
        kind: row.type === 'obs' ? 'observer' : 'sentry',
        time: asNumber(row.time),
        rawSlot: asNumber(row.slot),
        x: asNumber(row.x),
        y: asNumber(row.y),
        ehandle: row.ehandle ?? null,
      })
    } else if ((row.type === 'obs_left' || row.type === 'sen_left') && row.ehandle != null) {
      wardRemovals.set(String(row.ehandle), asNumber(row.time))
    }
  }

  if (last.size === 0) throw new Error('The parser produced no player interval data.')

  const match = await openDotaMatch(matchId)
  const odPlayers = new Map()
  if (match && Array.isArray(match.players)) {
    for (const player of match.players) {
      if (Number.isFinite(player.hero_id)) odPlayers.set(player.hero_id, player)
    }
  }

  const duration = Math.max(
    ...Array.from(last.values(), (row) => Math.max(0, asNumber(row.time))),
    asNumber(match?.duration),
  )
  const gameWinner = asNumber(epilogueDota?.gameWinner_)
  const radiantWin = typeof match?.radiant_win === 'boolean'
    ? match.radiant_win
    : gameWinner === 2

  const players = Array.from(last.values())
    .sort((a, b) => a.slot - b.slot)
    .map((row) => {
      const heroId = asNumber(row.hero_id)
      const odPlayer = odPlayers.get(heroId)
      const epiloguePlayer = epiloguePlayers[row.slot]
      const team = odPlayer?.isRadiant != null
        ? (odPlayer.isRadiant ? 'radiant' : 'dire')
        : epiloguePlayer?.team ?? teamOf(row.slot)
      const isRadiant = team === 'radiant'
      const winning = isRadiant === radiantWin
      const kills = asNumber(row.kills)
      const deaths = asNumber(row.deaths)
      const assists = asNumber(row.assists)
      const gold = asNumber(row.gold)
      const xp = asNumber(row.xp)
      return {
        slot: row.slot,
        playerSlot: asNumber(playerSlots.get(row.slot), row.slot),
        accountId: odPlayer?.account_id ?? epiloguePlayer?.accountId ?? null,
        personaname: odPlayer?.personaname ?? odPlayer?.name ?? epiloguePlayer?.personaname ?? null,
        steamId: epiloguePlayer?.steamId ?? (odPlayer?.account_id ? String(BigInt(odPlayer.account_id) + 76561197960265728n) : null),
        heroId,
        heroName: String(row.unit ?? '').replace(/^CDOTA_Unit_Hero_/, ''),
        level: asNumber(row.level),
        team,
        win: winning,
        kills,
        deaths,
        assists,
        kda: Number(((kills + assists) / Math.max(deaths, 1)).toFixed(2)),
        lastHits: asNumber(row.lh),
        denies: asNumber(row.denies),
        netWorth: asNumber(row.networth),
        gold,
        xp,
        goldPerMin: duration > 0 ? Math.round((gold / duration) * 60) : 0,
        xpPerMin: duration > 0 ? Math.round((xp / duration) * 60) : 0,
        heroDamage: asNumber(row.hero_damage),
        towerDamage: asNumber(row.tower_damage),
        heroHealing: asNumber(row.hero_healing ?? row.hero_healing_t),
        stuns: Number(asNumber(row.stuns).toFixed(2)),
        obsPlaced: asNumber(row.obs_placed),
        senPlaced: asNumber(row.sen_placed),
        observersPlaced: asNumber(row.observers_placed),
        campsStacked: asNumber(row.camps_stacked),
        creepsStacked: asNumber(row.creeps_stacked),
        runePickups: asNumber(row.rune_pickups),
        teamfightParticipation: asNumber(row.teamfight_participation),
        towersKilled: asNumber(row.towers_killed),
        roshansKilled: asNumber(row.roshans_killed),
      }
    })

  const playerBySlot = new Map(players.map((player) => [player.slot, player]))
  const wards = wardEvents
    .map((event) => {
      const player = playerBySlot.get(event.rawSlot)
      const lifetime = event.kind === 'observer' ? 360 : 480
      const startTime = Math.max(0, event.time)
      const removal = event.ehandle == null ? null : wardRemovals.get(String(event.ehandle))
      const destroyed = removal != null && removal >= event.time
      const endTime = Math.min(duration, removal != null ? removal : startTime + lifetime)
      return {
        id: `${event.kind}-${event.time}-${event.ehandle ?? event.rawSlot}`,
        kind: event.kind,
        time: startTime,
        x: Number(event.x.toFixed(2)),
        y: Number(event.y.toFixed(2)),
        endTime: Math.max(startTime, endTime),
        destroyed,
        team: player?.team ?? teamOf(event.rawSlot),
        playerSlot: player?.playerSlot ?? event.rawSlot,
        accountId: player?.accountId ?? null,
        heroId: player?.heroId ?? null,
      }
    })
    .sort((a, b) => a.time - b.time)

  const radiantKills = players.filter((p) => p.team === 'radiant').reduce((sum, p) => sum + p.kills, 0)
  const direKills = players.filter((p) => p.team === 'dire').reduce((sum, p) => sum + p.kills, 0)
  const gameMode = asNumber(match?.game_mode) || asNumber(epilogueDota?.gameMode_)

  const timeline = Array.from(timelineBuckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([minute, entries]) => {
      let radiantGold = 0
      let direGold = 0
      let radiantXp = 0
      let direXp = 0
      for (const row of entries.values()) {
        const slot = playerSlots.get(row.slot) ?? row.slot
        if (slot < 128) {
          radiantGold += asNumber(row.gold)
          radiantXp += asNumber(row.xp)
        } else {
          direGold += asNumber(row.gold)
          direXp += asNumber(row.xp)
        }
      }
      return {
        minute,
        radiantGold: Math.round(radiantGold),
        direGold: Math.round(direGold),
        radiantXp: Math.round(radiantXp),
        direXp: Math.round(direXp),
      }
    })

  return {
    match: {
      matchId,
      gameMode,
      gameModeName: MODE_NAMES[gameMode] ?? 'Unknown',
      startTime: asNumber(match?.start_time),
      duration,
      radiantWin,
      radiantKills,
      direKills,
      lobbyType: asNumber(match?.lobby_type),
      source: 'local-opendota-parser',
      rawLogLines: lineCount,
    },
    players,
    timeline,
    wards,
    generatedAt: new Date().toISOString(),
  }
}

function runSevenZip(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(SEVEN_ZIP_BIN, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else rejectPromise(new Error(`7-Zip exited ${code}: ${stderr.slice(-300)}`))
    })
  })
}

async function downloadReplay(matchId, match) {
  const replayUrl = match?.replay_url
  if (typeof replayUrl !== 'string' || !replayUrl.startsWith('http')) {
    throw new Error(`No replay URL is available from OpenDota for ${matchId}.`)
  }
  if (!existsSync(SEVEN_ZIP_BIN)) throw new Error(`7-Zip was not found at ${SEVEN_ZIP_BIN}.`)

  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(REPLAY_DIR, { recursive: true })
  const archivePath = join(DATA_DIR, `${matchId}.dem.bz2`)
  const tempDir = join(DATA_DIR, `replay-${matchId}`)

  const response = await fetch(replayUrl, { signal: AbortSignal.timeout(180000) })
  if (!response.ok || !response.body) {
    throw new Error(`Replay download failed (${response.status}).`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath))

  rmSync(tempDir, { recursive: true, force: true })
  mkdirSync(tempDir, { recursive: true })
  await runSevenZip(['x', '-y', `-o${tempDir}`, archivePath])

  const extracted = readdirSync(tempDir).find((name) => name.toLowerCase().endsWith('.dem'))
  if (!extracted) throw new Error('7-Zip extracted the replay but no .dem file was found.')
  const target = join(REPLAY_DIR, `${matchId}.dem`)
  const source = join(tempDir, extracted)
  try {
    renameSync(source, target)
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error
    copyFileSync(source, target)
    rmSync(source, { force: true })
  }
  rmSync(archivePath, { force: true })
  rmSync(tempDir, { recursive: true, force: true })
  return target
}

async function parseReplay(matchId, options = {}) {
  const { force = false, download = false, turboOnly = false, competitiveOnly = false } =
    typeof options === 'boolean' ? { force: options } : options
  const match = await openDotaMatch(matchId)
  if (turboOnly && match && Number(match.game_mode) !== 23) {
    return {
      skipped: true,
      reason: 'not-turbo',
      matchId,
      gameMode: typeof match?.game_mode === 'number' ? match.game_mode : null,
    }
  }
  if (competitiveOnly && match) {
    const gameMode = Number(match.game_mode)
    const lobbyType = Number(match.lobby_type)
    if (gameMode !== 23 && lobbyType !== 7) {
      return {
        skipped: true,
        reason: 'not-ranked-or-turbo',
        matchId,
        gameMode: Number.isFinite(gameMode) ? gameMode : null,
        lobbyType: Number.isFinite(lobbyType) ? lobbyType : null,
      }
    }
  }

  const rawPath = join(DATA_DIR, `${matchId}.jsonl`)
  const statsPath = join(DATA_DIR, `${matchId}.stats.json`)
  if (!force && existsSync(statsPath)) {
    const cachedStats = JSON.parse(readFileSync(statsPath, 'utf8'))
    const hasWardPayload = Array.isArray(cachedStats.wards)
    const hasTimeline = Array.isArray(cachedStats.timeline)
    if (hasWardPayload && hasTimeline) {
      try { recordParsedHistories(cachedStats) } catch { /* cache remains usable */ }
      return { cached: true, ...cachedStats }
    }
    // Old cache: upgrade it when the replay is still available locally.
    if (!existsSync(replayPath(matchId))) {
      try { recordParsedHistories(cachedStats) } catch { /* cache remains usable */ }
      return { cached: true, ...cachedStats }
    }
  }

  if (!(await ensureParser())) throw new Error('OpenDota parser is not reachable.')
  let replay = replayPath(matchId)
  if (!replay && download) replay = await downloadReplay(matchId, match)
  if (!replay) throw new Error(`No local replay found for ${matchId}. Download the replay in Dota 2 first.`)

  const body = readFileSync(replay)
  const response = await fetch(PARSER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body,
    signal: AbortSignal.timeout(180000),
  })
  if (!response.ok) {
    throw new Error(`Parser rejected the replay (${response.status}): ${(await response.text()).slice(0, 300)}`)
  }
  writeFileSync(rawPath, Buffer.from(await response.arrayBuffer()))
  const stats = await summarise(rawPath, matchId)
  writeFileSync(statsPath, `${JSON.stringify(stats, null, 2)}\n`)
  try { recordParsedHistories(stats) } catch { /* parse result is still usable */ }
  return { cached: false, ...stats }
}

function loadHistory(path) {
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveHistory(path, rows) {
  const temporary = `${path}.tmp`
  writeFileSync(temporary, `${JSON.stringify(rows, null, 2)}
`)
  renameSync(temporary, path)
}

function historyRows(stats) {
  return (stats.players ?? [])
    .filter((player) => player.accountId)
    .map((player) => ({
      match_id: Number(stats.match.matchId),
      account_id: player.accountId,
      player_slot: player.playerSlot,
      radiant_win: Boolean(stats.match.radiantWin),
      hero_id: player.heroId,
      start_time: stats.match.startTime,
      duration: stats.match.duration,
      game_mode: stats.match.gameMode,
      lobby_type: stats.match.lobbyType,
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      gold_per_min: player.goldPerMin,
      xp_per_min: player.xpPerMin,
      last_hits: player.lastHits,
      denies: player.denies,
      hero_damage: player.heroDamage,
      tower_damage: player.towerDamage,
      hero_healing: player.heroHealing ?? 0,
      personaname: player.personaname ?? null,
      source: 'local-parser',
    }))
}

function loadTurboNames() {
  const names = new Map()
  try {
    for (const file of readdirSync(DATA_DIR)) {
      if (!file.endsWith('.stats.json')) continue
      try {
        const stats = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
        for (const player of stats.players ?? []) {
          if (player.accountId && player.personaname) {
            names.set(Number(player.accountId), player.personaname)
          }
        }
      } catch {
        // A partially written stats file should not block the ledger.
      }
    }
  } catch {
    // The first parse will populate names.
  }
  return names
}

const turboNames = loadTurboNames()

function recordHistory(path, stats) {
  const history = loadHistory(path)
  const byKey = new Map(history.map((row) => [`${row.match_id}:${row.account_id}`, row]))
  for (const row of historyRows(stats)) {
    byKey.set(`${row.match_id}:${row.account_id}`, row)
  }
  saveHistory(path, [...byKey.values()].sort((a, b) => b.start_time - a.start_time))
}

function recordTurboHistory(stats) {
  if (Number(stats?.match?.gameMode) !== 23) return
  recordHistory(TURBO_HISTORY_PATH, stats)
}

function recordRankedHistory(stats) {
  if (Number(stats?.match?.gameMode) !== 22) return
  if (Number(stats?.match?.lobbyType) !== 7) return
  recordHistory(RANKED_HISTORY_PATH, stats)
}

function recordParsedHistories(stats) {
  recordTurboHistory(stats)
  recordRankedHistory(stats)
  for (const player of stats.players ?? []) {
    if (player.accountId && player.personaname) {
      turboNames.set(Number(player.accountId), player.personaname)
    }
  }
  if (Number(stats?.match?.gameMode) === 23) {
    try { ensureTurboElo() } catch { /* history remains usable */ }
  }
}

function importSharedTurboRows(input) {
  if (!Array.isArray(input)) throw new Error('rows must be an array.')
  const history = loadHistory(TURBO_HISTORY_PATH)
  const byKey = new Map(history.map((row) => [`${row.match_id}:${row.account_id}`, row]))
  let added = 0
  let skipped = 0
  let invalid = 0

  for (const source of input.slice(0, 5000)) {
    const matchId = Number(source?.match_id ?? source?.matchId)
    const accountId = Number(source?.account_id ?? source?.accountId)
    const gameMode = Number(source?.game_mode ?? source?.gameMode ?? 23)
    const duration = Number(source?.duration ?? 0)
    const startTime = Number(source?.start_time ?? source?.startTime ?? 0)
    if (
      !Number.isSafeInteger(matchId) || matchId <= 0 ||
      !Number.isSafeInteger(accountId) || accountId <= 0 ||
      gameMode !== 23 || duration < 60 || startTime <= 0
    ) {
      invalid += 1
      continue
    }
    let playerSlot = Number(source?.player_slot ?? source?.playerSlot)
    const team = source?.team
    if (team === 'dire' && playerSlot >= 0 && playerSlot < 5) playerSlot += 123
    if (!Number.isFinite(playerSlot) || playerSlot < 0 || playerSlot > 132) {
      invalid += 1
      continue
    }
    const key = `${matchId}:${accountId}`
    if (byKey.has(key)) {
      skipped += 1
      continue
    }
    byKey.set(key, {
      match_id: matchId,
      account_id: accountId,
      player_slot: playerSlot,
      radiant_win: Boolean(source?.radiant_win ?? source?.radiantWin),
      hero_id: asNumber(source?.hero_id ?? source?.heroId),
      start_time: startTime,
      duration,
      game_mode: 23,
      lobby_type: asNumber(source?.lobby_type ?? source?.lobbyType),
      kills: asNumber(source?.kills),
      deaths: asNumber(source?.deaths),
      assists: asNumber(source?.assists),
      gold_per_min: asNumber(source?.gold_per_min ?? source?.goldPerMin),
      xp_per_min: asNumber(source?.xp_per_min ?? source?.xpPerMin),
      last_hits: asNumber(source?.last_hits ?? source?.lastHits),
      denies: asNumber(source?.denies),
      hero_damage: asNumber(source?.hero_damage ?? source?.heroDamage),
      tower_damage: asNumber(source?.tower_damage ?? source?.towerDamage),
      hero_healing: asNumber(source?.hero_healing ?? source?.heroHealing),
      personaname: null,
      source: 'shared-archive',
    })
    added += 1
  }

  if (added > 0) {
    saveHistory(TURBO_HISTORY_PATH, [...byKey.values()].sort((a, b) => b.start_time - a.start_time))
    try { ensureTurboElo() } catch { /* history remains usable */ }
  }
  return { added, skipped, invalid, total: byKey.size }
}

function historyFor(path, accountId, limit) {
  const rows = loadHistory(path)
  const filtered = accountId
    ? rows.filter((row) => Number(row.account_id) === accountId)
    : rows
  return filtered
    .sort((a, b) => b.start_time - a.start_time)
    .slice(0, limit)
}

function turboHistoryFor(accountId, limit) {
  return historyFor(TURBO_HISTORY_PATH, accountId, limit)
}

function turboHistoryWithPeers(accountId, limit) {
  if (!accountId) return []
  const rows = loadHistory(TURBO_HISTORY_PATH)
  const matchIds = new Set(
    rows.filter((row) => Number(row.account_id) === accountId).map((row) => row.match_id),
  )
  if (!matchIds.size) return []
  return rows
    .filter((row) => matchIds.has(row.match_id))
    .sort((a, b) => b.start_time - a.start_time)
    .slice(0, limit)
}

function rankedHistoryFor(accountId, limit) {
  return historyFor(RANKED_HISTORY_PATH, accountId, limit)
}

function emptyTurboEloState() {
  return {
    version: 1,
    baseline: ELO_BASELINE,
    players: {},
    processed: {},
    history: {},
    updatedAt: 0,
  }
}

function loadTurboEloState() {
  if (!existsSync(TURBO_ELO_PATH)) return emptyTurboEloState()
  try {
    const parsed = JSON.parse(readFileSync(TURBO_ELO_PATH, 'utf8'))
    return {
      ...emptyTurboEloState(),
      ...parsed,
      baseline: ELO_BASELINE,
      players: parsed.players ?? {},
      processed: parsed.processed ?? {},
      history: parsed.history ?? {},
    }
  } catch {
    return emptyTurboEloState()
  }
}

function saveTurboEloState(state) {
  const temporary = `${TURBO_ELO_PATH}.tmp`
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(temporary, TURBO_ELO_PATH)
}

let turboEloState = null

function ensureTurboElo() {
  if (!turboEloState) turboEloState = loadTurboEloState()
  const groups = new Map()
  for (const row of loadHistory(TURBO_HISTORY_PATH)) {
    const matchId = String(row.match_id)
    const bucket = groups.get(matchId) ?? []
    bucket.push(row)
    groups.set(matchId, bucket)
  }

  const matches = [...groups.values()]
    .map((rows) => ({
      rows,
      start: Math.max(...rows.map((row) => Number(row.start_time) || 0)),
    }))
    .sort((a, b) => a.start - b.start)

  let changed = false
  for (const { rows, start } of matches) {
    const matchKey = String(rows[0]?.match_id ?? '')
    if (!matchKey || turboEloState.processed[matchKey]) continue
    const byAccount = new Map()
    for (const row of rows) {
      const accountId = Number(row.account_id)
      if (!Number.isFinite(accountId) || accountId <= 0) continue
      byAccount.set(accountId, row)
    }
    if (byAccount.size !== 10) continue
    const uniqueRows = [...byAccount.entries()].map(([accountId, row]) => ({ ...row, account_id: accountId }))
    const radiant = uniqueRows.filter((row) => Number(row.player_slot) < 128)
    const dire = uniqueRows.filter((row) => Number(row.player_slot) >= 128)
    if (radiant.length !== 5 || dire.length !== 5) continue

    const ratingOf = (accountId) =>
      Number(turboEloState.players[String(accountId)]?.rating ?? ELO_BASELINE)
    const radiantAverage = radiant.reduce((sum, row) => sum + ratingOf(row.account_id), 0) / 5
    const direAverage = dire.reduce((sum, row) => sum + ratingOf(row.account_id), 0) / 5
    const radiantExpected = 1 / (1 + 10 ** ((direAverage - radiantAverage) / 400))
    const direExpected = 1 - radiantExpected
    const radiantWon = Boolean(radiant[0]?.radiant_win)

    for (const row of uniqueRows) {
      const accountId = Number(row.account_id)
      const key = String(accountId)
      const isRadiant = Number(row.player_slot) < 128
      const won = isRadiant === radiantWon
      const expected = isRadiant ? radiantExpected : direExpected
      const delta = ELO_K * ((won ? 1 : 0) - expected)
      const previous = turboEloState.players[key] ?? {
        accountId,
        rating: ELO_BASELINE,
        games: 0,
        wins: 0,
        losses: 0,
        peak: ELO_BASELINE,
        lastDelta: 0,
        lastMatch: null,
        lastAt: 0,
      }
      const rating = previous.rating + delta
      turboEloState.players[key] = {
        ...previous,
        rating,
        games: previous.games + 1,
        wins: previous.wins + (won ? 1 : 0),
        losses: previous.losses + (won ? 0 : 1),
        peak: Math.max(previous.peak, rating),
        lastDelta: delta,
        lastMatch: matchKey,
        lastAt: start,
      }
      const playerHistory = turboEloState.history[key] ?? []
      playerHistory.push({ matchId: matchKey, rating, delta, at: start })
      turboEloState.history[key] = playerHistory.slice(-ELO_MAX_HISTORY)
    }
    turboEloState.processed[matchKey] = { at: Date.now(), startTime: start }
    changed = true
  }

  if (changed) {
    turboEloState.updatedAt = Date.now()
    saveTurboEloState(turboEloState)
  }
  return turboEloState
}

function turboEloPlayer(state, accountId, rank, limit) {
  const key = String(accountId)
  const player = state.players[key]
  const history = (state.history[key] ?? []).slice(-limit)
  return {
    accountId: Number(accountId),
    personaname: turboNames.get(Number(accountId)) ?? null,
    rating: player ? Math.round(player.rating * 10) / 10 : ELO_BASELINE,
    games: player?.games ?? 0,
    wins: player?.wins ?? 0,
    losses: player?.losses ?? 0,
    peak: player ? Math.round(player.peak * 10) / 10 : ELO_BASELINE,
    lastDelta: player ? Math.round(player.lastDelta * 10) / 10 : 0,
    lastMatch: player?.lastMatch ?? null,
    lastAt: player?.lastAt ?? null,
    rank: rank ?? null,
    history,
  }
}

function turboEloPayload(accountId, limit) {
  const state = ensureTurboElo()
  const ids = Object.keys(state.players)
  const ordered = ids
    .map((key) => ({ id: Number(key), rating: Number(state.players[key]?.rating ?? ELO_BASELINE) }))
    .sort((a, b) => b.rating - a.rating)
  const ranks = new Map(ordered.map((entry, index) => [entry.id, index + 1]))
  const leaderboard = ordered
    .slice(0, 12)
    .map((entry) => turboEloPlayer(state, entry.id, ranks.get(entry.id), 0))
  const player = accountId ? turboEloPlayer(state, accountId, ranks.get(Number(accountId)) ?? null, limit) : null
  return {
    baseline: ELO_BASELINE,
    matchesProcessed: Object.keys(state.processed).length,
    playersTracked: ids.length,
    updatedAt: state.updatedAt,
    player,
    leaderboard,
  }
}

const BACKFILL_LIMIT = 500
let backfillJob = null

async function recentTurboMatches(accountId) {
  const response = await fetch(`${API_BASE}/players/${accountId}/recentMatches`, {
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`OpenDota recentMatches returned ${response.status}`)
  const rows = await response.json()
  if (!Array.isArray(rows)) return []
  return rows
    .filter((match) => Number(match?.game_mode) === 23)
    .map((match) => ({
      matchId: String(match.match_id),
      startTime: Number(match.start_time) || 0,
      duration: Number(match.duration) || 0,
      heroId: Number(match.hero_id) || 0,
      win: (Number(match.player_slot) < 128) === Boolean(match.radiant_win),
    }))
    .sort((a, b) => b.startTime - a.startTime)
}

function backfillPayload(job) {
  if (!job) return null
  return {
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    total: job.matchIds.length,
    completed: job.completed,
    current: job.current,
    results: job.results,
  }
}

async function runBackfill(job) {
  for (const matchId of job.matchIds) {
    if (job.cancelled) break
    job.current = matchId
    try {
      const result = await parseReplay(matchId, {
        force: false,
        download: true,
        turboOnly: true,
      })
      if (result.skipped) {
        job.results.push({
          matchId,
          status: 'skipped',
          reason: result.reason,
          gameMode: result.gameMode,
        })
      } else {
        job.results.push({
          matchId,
          status: result.cached ? 'cached' : 'parsed',
          gameMode: result.match?.gameMode ?? 23,
        })
      }
    } catch (error) {
      job.results.push({
        matchId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
    job.completed += 1
  }
  job.current = null
  job.status = job.cancelled ? 'cancelled' : 'complete'
  job.finishedAt = new Date().toISOString()
}

const knownReplays = new Set()
const replaySizes = new Map()
const replayRetryAt = new Map()
let replayScanBusy = false

function demMatchId(fileName) {
  const match = /^([0-9]{1,20})\.dem$/i.exec(fileName)
  if (!match) return null
  const matchId = Number(match[1])
  return Number.isSafeInteger(matchId) && matchId > 0 ? matchId : null
}

function seedKnownReplays() {
  try {
    for (const file of readdirSync(REPLAY_DIR)) {
      const matchId = demMatchId(file)
      if (matchId) knownReplays.add(matchId)
    }
  } catch {
    // Dota's replay folder may not exist on a fresh install.
  }
}

async function scanReplayFolder() {
  if (replayScanBusy) return
  replayScanBusy = true
  try {
    let files
    try {
      files = readdirSync(REPLAY_DIR)
    } catch {
      return
    }
    const now = Date.now()
    for (const file of files) {
      const matchId = demMatchId(file)
      if (!matchId || knownReplays.has(matchId)) continue
      if ((replayRetryAt.get(matchId) ?? 0) > now) continue

      const replay = join(REPLAY_DIR, file)
      let size = 0
      try {
        const stat = statSync(replay)
        if (!stat.isFile()) continue
        size = stat.size
      } catch {
        continue
      }
      if (size <= 0) continue

      // Wait one scan for Dota to finish writing the file.
      if (replaySizes.get(matchId) !== size) {
        replaySizes.set(matchId, size)
        continue
      }

      replaySizes.delete(matchId)
      if (existsSync(join(DATA_DIR, `${matchId}.stats.json`))) {
        knownReplays.add(matchId)
        continue
      }

      console.log(`New replay detected: ${file} (${size} bytes)`)
      try {
        await parseReplay(matchId, { force: false })
        knownReplays.add(matchId)
        replayRetryAt.delete(matchId)
        console.log(`Auto-parsed replay ${matchId}`)
      } catch (error) {
        replayRetryAt.set(matchId, Date.now() + 30_000)
        console.log(`Auto-parse failed for ${matchId}: ${error instanceof Error ? error.message : String(error)}`)
      }
      break
    }
  } finally {
    replayScanBusy = false
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    })
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      const parser = await parserHealthy()
      return json(res, 200, {
        ok: true,
        parser,
        replayDir: REPLAY_DIR,
        dataDir: DATA_DIR,
        javaBin: JAVA_BIN,
        parserJar: PARSER_JAR,
        replays: listReplays().length,
      })
    }

    if (req.method === 'GET' && url.pathname === '/replays') {
      return json(res, 200, { replayDir: REPLAY_DIR, replays: listReplays() })
    }

    if (req.method === 'GET' && url.pathname.startsWith('/stats/')) {
      const matchId = safeId(url.pathname.split('/').pop())
      const path = join(DATA_DIR, `${matchId}.stats.json`)
      if (!existsSync(path)) return json(res, 404, { error: 'No parsed stats for this match yet.' })
      return json(res, 200, JSON.parse(readFileSync(path, 'utf8')))
    }

    if (req.method === 'GET' && url.pathname === '/turbo-history') {
      const accountId = Number(url.searchParams.get('accountId') ?? 0) || null
      const includePeers = url.searchParams.get('includePeers') === '1'
      const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get('limit') ?? 1000) || 1000))
      const matches = includePeers
        ? turboHistoryWithPeers(accountId, limit)
        : turboHistoryFor(accountId, limit)
      return json(res, 200, { accountId, includePeers, count: matches.length, matches })
    }

    if (req.method === 'GET' && url.pathname === '/ranked-history') {
      const accountId = Number(url.searchParams.get('accountId') ?? 0) || null
      const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get('limit') ?? 1000) || 1000))
      const matches = rankedHistoryFor(accountId, limit)
      return json(res, 200, { accountId, count: matches.length, matches })
    }

    if (req.method === 'GET' && url.pathname === '/turbo-elo') {
      const accountId = Number(url.searchParams.get('accountId') ?? 0) || null
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') ?? 100) || 100))
      return json(res, 200, turboEloPayload(accountId, limit))
    }

    if (req.method === 'GET' && url.pathname === '/recent-turbo') {
      const accountId = Number(url.searchParams.get('accountId') ?? 0) || 0
      if (!accountId) return json(res, 400, { error: 'accountId is required' })
      return json(res, 200, { accountId, matches: await recentTurboMatches(accountId) })
    }

    if (req.method === 'GET' && url.pathname === '/backfill') {
      return json(res, 200, { backfill: backfillPayload(backfillJob) })
    }

    if (req.method === 'POST' && url.pathname === '/backfill/cancel') {
      if (!backfillJob || backfillJob.status !== 'running') {
        return json(res, 409, { error: 'No backfill is running.' })
      }
      backfillJob.cancelled = true
      return json(res, 202, { backfill: backfillPayload(backfillJob) })
    }

    if (req.method === 'POST' && url.pathname === '/backfill') {
      if (backfillJob?.status === 'running') {
        return json(res, 409, { error: 'A backfill is already running.' })
      }
      let body = ''
      for await (const chunk of req) {
        body += chunk
        if (body.length > 2_000_000) throw new Error('Request body too large')
      }
      const parsed = body ? JSON.parse(body) : {}
      const matchIds = [...new Set(
        (Array.isArray(parsed.matchIds) ? parsed.matchIds : [])
          .map((value) => safeId(value))
          .filter(Boolean),
      )].slice(0, BACKFILL_LIMIT)
      if (!matchIds.length) return json(res, 400, { error: 'No valid match IDs supplied.' })
      backfillJob = {
        id: `backfill-${Date.now()}`,
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        matchIds,
        completed: 0,
        current: null,
        results: [],
        cancelled: false,
      }
      void runBackfill(backfillJob)
      return json(res, 202, { backfill: backfillPayload(backfillJob) })
    }

    if (req.method === 'POST' && url.pathname === '/shared-history') {
      let body = ''
      for await (const chunk of req) {
        body += chunk
        if (body.length > 2_000_000) throw new Error('Request body too large')
      }
      const parsed = body ? JSON.parse(body) : {}
      const rows = Array.isArray(parsed) ? parsed : parsed.rows
      return json(res, 200, { ok: true, ...importSharedTurboRows(rows) })
    }

    if (req.method === 'POST' && url.pathname === '/parse') {
      let body = ''
      for await (const chunk of req) {
        body += chunk
        if (body.length > 1_000_000) throw new Error('Request body too large')
      }
      const parsed = body ? JSON.parse(body) : {}
      const matchId = safeId(parsed.matchId ?? url.searchParams.get('matchId'))
      const result = await parseReplay(matchId, {
        force: Boolean(parsed.force),
        download: Boolean(parsed.download),
        turboOnly: Boolean(parsed.turboOnly),
        competitiveOnly: Boolean(parsed.competitiveOnly),
      })
      return json(res, 200, result)
    }

    return json(res, 404, { error: 'Not found' })
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`DotaScope parser worker listening on http://127.0.0.1:${PORT}`)
  console.log(`Replay directory: ${REPLAY_DIR}`)
  seedKnownReplays()
  setInterval(() => { void scanReplayFolder() }, 5000).unref()
})

function shutdown() {
  server.close(() => process.exit(0))
  if (parserProcess && !parserProcess.killed) parserProcess.kill()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
