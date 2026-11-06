const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
}

const MAX_BYTES = 1_500_000
const MAX_TIMELINE = 240
const MAX_WARDS = 1_200
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60 * 60 * 1000

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function error(message, status = 400) {
  return json({ ok: false, error: message }, status)
}

function integer(value, fallback = 0, max = 2_000_000_000) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.min(max, Math.round(number)))
}

function ratio(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(1, number))
}

function cleanPlayer(player, index, duration) {
  if (!player || typeof player !== 'object') {
    throw new Error(`player ${index} is invalid`)
  }
  const rawSlot = Number(player.slot ?? player.playerSlot)
  const playerSlot = Number.isFinite(rawSlot) && rawSlot >= 128 && rawSlot <= 132
    ? rawSlot - 123
    : integer(rawSlot, -1, 9)
  if (playerSlot < 0 || playerSlot > 9) {
    throw new Error(`player ${index} has an invalid slot`)
  }
  const heroId = integer(player.heroId ?? player.hero_id, 0, 1000)
  if (heroId <= 0) {
    throw new Error(`player ${index} has an invalid hero`)
  }
  const team = player.team === 'dire' || player.team === 'radiant'
    ? player.team
    : playerSlot < 5 ? 'radiant' : 'dire'
  const accountId = player.accountId ?? player.account_id
  return {
    playerSlot,
    accountId: accountId == null ? null : integer(accountId, 0, 10_000_000_000),
    heroId,
    team,
    win: Boolean(player.win),
    kills: integer(player.kills, 0, 1000),
    deaths: integer(player.deaths, 0, 1000),
    assists: integer(player.assists, 0, 1000),
    lastHits: integer(player.lastHits ?? player.last_hits, 0, 100_000),
    denies: integer(player.denies, 0, 100_000),
    netWorth: integer(player.netWorth ?? player.net_worth, 0, 10_000_000),
    gold: integer(player.gold, 0, 10_000_000),
    xp: integer(player.xp, 0, 10_000_000),
    goldPerMin: integer(player.goldPerMin ?? player.gold_per_min, 0, 100_000),
    xpPerMin: integer(player.xpPerMin ?? player.xp_per_min, 0, 100_000),
    heroDamage: integer(player.heroDamage ?? player.hero_damage, 0, 10_000_000),
    towerDamage: integer(player.towerDamage ?? player.tower_damage, 0, 10_000_000),
    heroHealing: integer(player.heroHealing ?? player.hero_healing, 0, 10_000_000),
    stuns: integer(player.stuns, 0, 10_000),
    obsPlaced: integer(player.obsPlaced ?? player.obs_placed, 0, 10_000),
    senPlaced: integer(player.senPlaced ?? player.sen_placed, 0, 10_000),
    observersPlaced: integer(player.observersPlaced ?? player.observers_placed, 0, 10_000),
    campsStacked: integer(player.campsStacked ?? player.camps_stacked, 0, 10_000),
    creepsStacked: integer(player.creepsStacked ?? player.creeps_stacked, 0, 10_000),
    runePickups: integer(player.runePickups ?? player.rune_pickups, 0, 10_000),
    teamfightParticipation: ratio(player.teamfightParticipation ?? player.teamfight_participation),
    towersKilled: integer(player.towersKilled ?? player.towers_killed, 0, 100),
    roshansKilled: integer(player.roshansKilled ?? player.roshans_killed, 0, 100),
    duration,
  }
}

function cleanWard(ward, index) {
  if (!ward || typeof ward !== 'object') return null
  const kind = ward.kind === 'sentry' ? 'sentry' : 'observer'
  const team = ward.team === 'dire' ? 'dire' : 'radiant'
  return {
    id: String(ward.id ?? `${kind}-${index}`).slice(0, 64),
    kind,
    time: integer(ward.time, 0, 20_000),
    x: Number(ward.x) || 0,
    y: Number(ward.y) || 0,
    endTime: integer(ward.endTime ?? ward.end_time, 0, 20_000),
    destroyed: Boolean(ward.destroyed),
    team,
    playerSlot: integer(ward.playerSlot ?? ward.player_slot, 0, 9),
    accountId: ward.accountId == null ? null : integer(ward.accountId, 0, 10_000_000_000),
    heroId: ward.heroId == null ? null : integer(ward.heroId, 0, 1000),
  }
}

function cleanTimeline(point, index) {
  if (!point || typeof point !== 'object') return null
  return {
    minute: integer(point.minute, index, 240),
    radiantGold: integer(point.radiantGold ?? point.radiant_gold, 0, 20_000_000),
    direGold: integer(point.direGold ?? point.dire_gold, 0, 20_000_000),
    radiantXp: integer(point.radiantXp ?? point.radiant_xp, 0, 20_000_000),
    direXp: integer(point.direXp ?? point.dire_xp, 0, 20_000_000),
  }
}

function normalize(body) {
  const candidate = body?.match
  const stats = candidate && typeof candidate === 'object' && candidate.match
    ? candidate
    : body?.stats ?? body
  const meta = stats?.match
  if (!stats || !meta || typeof meta !== 'object') {
    throw new Error('Expected a parsed match payload with a match object.')
  }
  const matchId = String(meta.matchId ?? meta.match_id ?? '').trim()
  if (!/^\d{1,20}$/.test(matchId)) throw new Error('matchId must be a numeric match ID.')

  const gameMode = integer(meta.gameMode ?? meta.game_mode, 0, 100)
  if (gameMode !== 22 && gameMode !== 23) {
    throw new Error('Only parsed Ranked All Pick (22) and Turbo (23) matches are accepted.')
  }
  const duration = integer(meta.duration, 0, 20_000)
  if (duration < 60) throw new Error('duration is too short to be a real match.')
  const players = Array.isArray(stats.players) ? stats.players : []
  if (players.length !== 10) throw new Error('A parsed match must contain exactly 10 players.')
  const slots = new Set()
  const cleanPlayers = players.map((player, index) => {
    const clean = cleanPlayer(player, index, duration)
    if (slots.has(clean.playerSlot)) throw new Error('Duplicate player slots.')
    slots.add(clean.playerSlot)
    return clean
  })
  if (slots.size !== 10) throw new Error('Player slots must cover 0–9.')

  const timeline = (Array.isArray(stats.timeline) ? stats.timeline : [])
    .slice(0, MAX_TIMELINE)
    .map(cleanTimeline)
    .filter(Boolean)
  const wards = (Array.isArray(stats.wards) ? stats.wards : [])
    .slice(0, MAX_WARDS)
    .map(cleanWard)
    .filter(Boolean)

  const cleanMeta = {
    matchId,
    gameMode,
    gameModeName: String(meta.gameModeName ?? (gameMode === 23 ? 'Turbo' : 'All Pick')).slice(0, 32),
    startTime: integer(meta.startTime ?? meta.start_time, 0, 4_000_000_000),
    duration,
    radiantWin: Boolean(meta.radiantWin ?? meta.radiant_win),
    radiantKills: integer(meta.radiantKills ?? meta.radiant_kills, 0, 1000),
    direKills: integer(meta.direKills ?? meta.dire_kills, 0, 1000),
    lobbyType: integer(meta.lobbyType ?? meta.lobby_type, 0, 100),
  }
  return {
    match: cleanMeta,
    players: cleanPlayers,
    timeline,
    wards,
    generatedAt: Date.now(),
    source: 'dotascope-shared',
  }
}

async function hashIp(request) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function upload(request, env) {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BYTES) return error('Payload too large.', 413)
  const raw = await request.text()
  if (raw.length > MAX_BYTES) return error('Payload too large.', 413)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return error('Invalid JSON body.')
  }
  let payload
  try {
    payload = normalize(body)
  } catch (reason) {
    return error(reason instanceof Error ? reason.message : 'Invalid payload.')
  }

  const matchId = payload.match.matchId
  const existing = await env.DB.prepare('SELECT match_id FROM matches WHERE match_id = ?').bind(matchId).first()
  if (existing) return json({ ok: true, matchId, duplicate: true }, 200)

  const ipHash = await hashIp(request)
  const cutoff = Date.now() - RATE_WINDOW_MS
  const rate = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM upload_events WHERE ip_hash = ? AND created_at > ?',
  ).bind(ipHash, cutoff).first()
  if (Number(rate?.total ?? 0) >= RATE_LIMIT) {
    return error('Upload rate limit reached. Try again later.', 429)
  }

  const now = Date.now()
  const statements = [
    env.DB.prepare(
      `INSERT INTO matches (match_id, start_time, duration, game_mode, radiant_win, source, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      matchId,
      payload.match.startTime,
      payload.match.duration,
      payload.match.gameMode,
      payload.match.radiantWin ? 1 : 0,
      'dotascope',
      JSON.stringify(payload),
      now,
    ),
    ...payload.players.map((player) =>
      env.DB.prepare(
        `INSERT INTO players (
          match_id, account_id, player_slot, hero_id, team, won, kills, deaths, assists,
          gold_per_min, xp_per_min, last_hits, denies, hero_damage, tower_damage, hero_healing,
          obs_placed, sen_placed, camps_stacked, rune_pickups, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        matchId,
        player.accountId,
        player.playerSlot,
        player.heroId,
        player.team,
        player.win ? 1 : 0,
        player.kills,
        player.deaths,
        player.assists,
        player.goldPerMin,
        player.xpPerMin,
        player.lastHits,
        player.denies,
        player.heroDamage,
        player.towerDamage,
        player.heroHealing,
        player.obsPlaced,
        player.senPlaced,
        player.campsStacked,
        player.runePickups,
        now,
      ),
    ),
    env.DB.prepare('INSERT INTO upload_events (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, now),
  ]

  try {
    await env.DB.batch(statements)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    if (message.toLowerCase().includes('unique')) {
      return json({ ok: true, matchId, duplicate: true }, 200)
    }
    return error('Could not store this match.', 500)
  }
  return json({ ok: true, matchId, duplicate: false, players: 10, timeline: payload.timeline.length, wards: payload.wards.length }, 201)
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }
    const url = new URL(request.url)
    try {
      if (url.pathname === '/health') {
        const row = await env.DB.prepare('SELECT COUNT(*) AS matches FROM matches').first()
        return json({ ok: true, service: 'dotascope-shared', matches: Number(row?.matches ?? 0) })
      }
      if (url.pathname === '/v1/matches' && request.method === 'POST') {
        return await upload(request, env)
      }
      if (url.pathname === '/v1/recent' && request.method === 'GET') {
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? 25)))
        const rows = await env.DB.prepare(
          `SELECT match_id, start_time, duration, game_mode, radiant_win, created_at
           FROM matches ORDER BY created_at DESC LIMIT ?`,
        ).bind(limit).all()
        return json({ ok: true, matches: rows.results ?? [] })
      }
      const match = url.pathname.match(/^\/v1\/matches\/(\d{1,20})$/)
      if (match && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT payload, created_at FROM matches WHERE match_id = ?')
          .bind(match[1]).first()
        if (!row) return error('Match not found in the shared archive.', 404)
        return json({ ok: true, sharedAt: row.created_at, payload: JSON.parse(row.payload) })
      }
      return error('Not found.', 404)
    } catch (reason) {
      console.error(reason)
      return error('Shared archive request failed.', 500)
    }
  },
}
