import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Clock3,
  Download,
  Eye,
  Radio,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Swords,
  WifiOff,
} from 'lucide-react'
import { useMeta } from '../context/MetaContext'
import { TTL } from '../lib/api'
import {
  clockText,
  fetchGsiLatest,
  gameStateLabel,
  isNativeGsiHost,
  readDraftHeroIds,
  readOwnItems,
  sideFromTeam,
  teamLabel,
  type GsiEnvelope,
} from '../lib/gsi'
import { useDocumentTitle, useRemote } from '../lib/hooks'
import { heroImage, itemImage } from '../lib/constants'
import { formatCompact, formatNumber, timeAgoFromIso } from '../lib/format'
import type { DotaItem, HeroStat, ItemConstants } from '../types'
import { HeroPortrait, PageHeader, PageLoader } from '../components/ui'

type PhaseKey = 'start_game_items' | 'early_game_items' | 'mid_game_items' | 'late_game_items'

interface ThreatGroup {
  key: string
  label: string
  heroes: Set<string>
  items: { key: string; reason: string }[]
}

const THREAT_GROUPS: ThreatGroup[] = [
  {
    key: 'invis',
    label: 'Invisibility',
    heroes: new Set(['Riki', 'Bounty Hunter', 'Clinkz', 'Nyx Assassin', 'Weaver', 'Sand King', 'Mirana', 'Templar Assassin']),
    items: [
      { key: 'ward_sentry', reason: 'Reveals invisible heroes before they get a jump' },
      { key: 'dust', reason: 'Stops an invisible escape or re-engage' },
      { key: 'gem', reason: 'Permanent true sight for a team that keeps getting picked off' },
    ],
  },
  {
    key: 'magic',
    label: 'Magic burst',
    heroes: new Set(['Zeus', 'Lina', 'Lion', 'Leshrac', 'Storm Spirit', 'Puck', 'Queen of Pain', 'Invoker', 'Outworld Destroyer', 'Timbersaw', 'Necrophos', 'Death Prophet', 'Venomancer', 'Ogre Magi', 'Techies']),
    items: [
      { key: 'black_king_bar', reason: 'Spell immunity through their burst window' },
      { key: 'pipe', reason: 'Team-wide barrier against magic damage' },
      { key: 'mage_slayer', reason: 'Attack damage reduction after their spells land' },
    ],
  },
  {
    key: 'physical',
    label: 'Physical damage',
    heroes: new Set(['Phantom Assassin', 'Sven', 'Juggernaut', 'Drow Ranger', 'Templar Assassin', 'Ursa', 'Lifestealer', 'Slark', 'Troll Warlord', 'Faceless Void', 'Morphling', 'Terrorblade', 'Luna']),
    items: [
      { key: 'ghost', reason: 'Ethereal form blanks a right-click burst' },
      { key: 'crimson_guard', reason: 'Block value against sustained physical damage' },
      { key: 'solar_crest', reason: 'Armor and attack speed swing for the team' },
    ],
  },
  {
    key: 'heal',
    label: 'Sustain and healing',
    heroes: new Set(['Oracle', 'Dazzle', 'Omniknight', 'Io', 'Warlock', 'Necrophos', 'Treant Protector', 'Winter Wyvern']),
    items: [
      { key: 'spirit_vessel', reason: 'Applies healing reduction to their frontline' },
      { key: 'shivas_guard', reason: 'AoE slow and healing reduction in the middle of a fight' },
    ],
  },
  {
    key: 'silence',
    label: 'Silence and lockdown',
    heroes: new Set(['Silencer', 'Death Prophet', 'Night Stalker', 'Disruptor', 'Skywrath Mage', 'Bloodseeker', 'Doom']),
    items: [
      { key: 'eul', reason: 'A self-setup to purge silence and reset the fight' },
      { key: 'lotus_orb', reason: 'Reflects targeted control and can purge silence' },
      { key: 'guardian_greaves', reason: 'Team heal and basic dispel for a lockdown draft' },
    ],
  },
  {
    key: 'illusions',
    label: 'Illusions and summons',
    heroes: new Set(['Phantom Lancer', 'Naga Siren', 'Chaos Knight', 'Broodmother', "Nature's Prophet", 'Lycan', 'Beastmaster', 'Terrorblade']),
    items: [
      { key: 'mjollnir', reason: 'Chain lightning clears waves of illusions' },
      { key: 'gleipnir', reason: 'AoE catch and lightning against summons' },
      { key: 'shivas_guard', reason: 'AoE armor and slow against clustered units' },
    ],
  },
]

function phaseForClock(clock: number | undefined): { key: PhaseKey; label: string } {
  const seconds = typeof clock === 'number' && Number.isFinite(clock) ? clock : 0
  if (seconds < 0) return { key: 'start_game_items', label: 'Pre-game' }
  if (seconds < 10 * 60) return { key: 'start_game_items', label: 'Laning' }
  if (seconds < 25 * 60) return { key: 'early_game_items', label: 'Early game' }
  if (seconds < 40 * 60) return { key: 'mid_game_items', label: 'Mid game' }
  return { key: 'late_game_items', label: 'Late game' }
}

const BOOT_KEYS = new Set([
  'boots',
  'power_treads',
  'phase_boots',
  'arcane_boots',
  'tranquil_boots',
  'guardian_greaves',
  'travel_boots',
  'travel_boots_2',
  'boots_of_bearing',
])

function heroForId(heroes: HeroStat[], id: number | undefined) {
  if (!id) return null
  return heroes.find((hero) => hero.id === id) ?? null
}

function itemForId(itemById: Map<number, { key: string; item: DotaItem }>, id: string) {
  return itemById.get(Number(id)) ?? null
}

function draftSlots(heroes: HeroStat[], ids: number[]) {
  return Array.from({ length: 5 }, (_, index) => heroForId(heroes, ids[index]))
}

export function LivePage() {
  useDocumentTitle('Live suggestions')
  const native = isNativeGsiHost()
  const meta = useMeta()
  const [envelope, setEnvelope] = useState<GsiEnvelope | null>(null)
  const [bridgeError, setBridgeError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(true)

  const payload = envelope?.available ? envelope.payload : null
  const heroId = Number(payload?.hero?.id ?? payload?.hero?.hero_id ?? 0) || null
  const hero = heroForId(meta.heroes, heroId ?? undefined)
  const ownSide = sideFromTeam(payload?.player?.team)
  const team2 = readDraftHeroIds(payload?.draft?.team2)
  const team3 = readDraftHeroIds(payload?.draft?.team3)
  const allyIds = ownSide === 'radiant' ? team2 : ownSide === 'dire' ? team3 : []
  const enemyIds = ownSide === 'radiant' ? team3 : ownSide === 'dire' ? team2 : []
  const ownItems = readOwnItems(payload?.items)
  const owned = new Set(ownItems.map((item) => item.key))
  const clock = payload?.map?.clock_time ?? payload?.map?.game_time
  const phase = phaseForClock(clock)

  const popularity = useRemote<Record<string, Record<string, number>>>(
    heroId ? `/heroes/${heroId}/itemPopularity` : null,
    TTL.detail,
  )
  const itemConstants = useRemote<ItemConstants>('/constants/items', TTL.constants)
  const itemById = useMemo(() => {
    const map = new Map<number, { key: string; item: DotaItem }>()
    for (const [key, item] of Object.entries(itemConstants.data ?? {})) {
      map.set(Number(item.id), { key, item })
    }
    return map
  }, [itemConstants.data])
  const itemByKey = useMemo(() => {
    const map = new Map<string, DotaItem>()
    for (const [key, item] of Object.entries(itemConstants.data ?? {})) {
      map.set(key, item)
    }
    return map
  }, [itemConstants.data])

  useEffect(() => {
    if (!native) {
      setRefreshing(false)
      return
    }

    let active = true
    let controller: AbortController | null = null

    const poll = async () => {
      controller?.abort()
      controller = new AbortController()
      try {
        const next = await fetchGsiLatest(controller.signal)
        if (!active) return
        setEnvelope(next)
        setBridgeError(null)
      } catch (error) {
        if (!active) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setBridgeError(error instanceof Error ? error.message : 'The local GSI bridge did not respond.')
      } finally {
        if (active) setRefreshing(false)
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 1500)
    return () => {
      active = false
      controller?.abort()
      window.clearInterval(timer)
    }
  }, [native])

  const enemyHeroes = useMemo(
    () => enemyIds.map((id) => heroForId(meta.heroes, id)).filter((entry): entry is HeroStat => Boolean(entry)),
    [enemyIds, meta.heroes],
  )

  const suggestions = useMemo(() => {
    if (!heroId || !popularity.data) return []
    const ownsBoots = [...owned].some((key) => BOOT_KEYS.has(key))
    const phaseItems = popularity.data[phase.key] ?? {}
    const allPhaseCounts = Object.values(popularity.data).reduce<Record<string, number>>((sum, group) => {
      for (const [id, count] of Object.entries(group)) {
        sum[id] = (sum[id] ?? 0) + count
      }
      return sum
    }, {})
    const maxPopular = Math.max(...Object.values(allPhaseCounts), 1)

    const candidates = new Map<string, { key: string; item: DotaItem; score: number; reason: string; counter: boolean }>()
    for (const [id, count] of Object.entries(phaseItems)) {
      const resolved = itemForId(itemById, id)
      if (!resolved || owned.has(resolved.key) || (ownsBoots && BOOT_KEYS.has(resolved.key))) continue
      const popularityScore = (count / maxPopular) * 100
      candidates.set(resolved.key, {
        key: resolved.key,
        item: resolved.item,
        score: popularityScore,
        reason: `Popular on ${hero?.localized_name ?? 'this hero'} in ${phase.label.toLowerCase()} (${formatNumber(count)} buys)`,
        counter: false,
      })
    }

    const matchedGroups: { group: ThreatGroup; names: string[] }[] = []
    for (const group of THREAT_GROUPS) {
      const names = enemyHeroes.filter((enemy) => group.heroes.has(enemy.localized_name)).map((enemy) => enemy.localized_name)
      if (names.length) matchedGroups.push({ group, names })
    }

    for (const { group, names } of matchedGroups) {
      for (const counter of group.items) {
        if (owned.has(counter.key)) continue
        const item = itemByKey.get(counter.key)
        if (!item) continue
        const existing = candidates.get(counter.key)
        const bonus = 120 + names.length * 8
        if (existing) {
          existing.score += bonus
          existing.counter = true
          existing.reason = `${counter.reason}. Threat: ${names.slice(0, 3).join(', ')}.`
        } else {
          candidates.set(counter.key, {
            key: counter.key,
            item,
            score: bonus,
            reason: `${counter.reason}. Threat: ${names.slice(0, 3).join(', ')}.`,
            counter: true,
          })
        }
      }
    }

    return [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, 6)
  }, [enemyHeroes, hero?.localized_name, heroId, itemByKey, itemById, owned, phase.key, phase.label, popularity.data])

  const hpPercent = typeof payload?.hero?.health === 'number' && typeof payload?.hero?.max_health === 'number' && payload.hero.max_health
    ? Math.max(0, Math.min(100, (payload.hero.health / payload.hero.max_health) * 100))
    : 0
  const mpPercent = typeof payload?.hero?.mana === 'number' && typeof payload?.hero?.max_mana === 'number' && payload.hero.max_mana
    ? Math.max(0, Math.min(100, (payload.hero.mana / payload.hero.max_mana) * 100))
    : 0
  const ownTeam = payload?.player?.team
  const isRunning = payload?.map?.game_state?.includes('GAME_IN_PROGRESS')
  const lastSeen = envelope?.receivedAt ? timeAgoFromIso(envelope.receivedAt) : null

  return (
    <div className="page-stack live-page">
      <PageHeader
        eyebrow="LIVE TELEMETRY"
        title="Read the game, make the call."
        description="DotaScope watches Dota 2's official Game State Integration feed and turns what the game exposes into a small, honest item plan."
        actions={
          <div className="live-header-actions">
            <span className={native ? 'live-status-pill is-native' : 'live-status-pill'}>
              <Radio size={13} />
              {native ? (payload ? 'GSI live' : 'GSI waiting') : 'Desktop app feature'}
            </span>
            {native && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setRefreshing(true)}
                disabled={refreshing}
              >
                <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh
              </button>
            )}
          </div>
        }
      />

      {!native ? (
        <section className="panel live-unsupported">
          <div className="live-unsupported-icon"><WifiOff size={26} /></div>
          <div>
            <p className="eyebrow">Windows host required</p>
            <h2>Live suggestions needs the desktop app.</h2>
            <p>
              The browser and Android builds can read OpenDota. Only the Windows host can receive Dota 2's local
              Game State Integration feed. Install the desktop build, then follow the setup below.
            </p>
            <div className="live-actions">
              <a className="btn btn-primary btn-sm" href="https://github.com/theclintoris/DotaScope/releases/latest" target="_blank" rel="noreferrer">
                Get the Windows build
              </a>
              <a className="btn btn-ghost btn-sm" href="/integrations/gamestate_integration_dotascope.cfg" download>
                <Download size={14} /> Download GSI config
              </a>
            </div>
          </div>
        </section>
      ) : bridgeError && !payload ? (
        <section className="panel live-error-panel">
          <div className="inline-alert inline-alert-error"><WifiOff size={16} /> {bridgeError}</div>
          <p className="muted-copy">
            Make sure the Windows app was started from DotaScope.exe and that the local bridge port is free. The
            desktop host opens <code>127.0.0.1:53000</code> automatically.
          </p>
        </section>
      ) : !payload ? (
        <section className="panel live-waiting">
          <div className="live-waiting-head">
            <div className="live-unsupported-icon"><Radio size={25} /></div>
            <div>
              <p className="eyebrow">Bridge online</p>
              <h2>Waiting for a match.</h2>
              <p>
                DotaScope is listening on <code>127.0.0.1:53000</code>. Start or spectate a Dota 2 match to receive a
                live payload. If you just installed the config, restart Dota 2.
              </p>
            </div>
          </div>
          <div className="live-setup-grid">
            <div>
              <span className="live-step">01</span>
              <strong>Install the GSI config</strong>
              <p>Copy the file into <code>game\dota\cfg\gamestate_integration</code>.</p>
              <a href="/integrations/gamestate_integration_dotascope.cfg" download className="text-link">
                <Download size={13} /> Download GSI config
              </a>
            </div>
            <div>
              <span className="live-step">02</span>
              <strong>Enable GSI</strong>
              <p>Launch Dota 2 with <code>-gamestateintegration</code> in Steam launch options.</p>
            </div>
            <div>
              <span className="live-step">03</span>
              <strong>Play or spectate</strong>
              <p>Your own inventory is exposed while playing; spectating can expose all-player data.</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="live-topline panel">
            <div className="live-match-state">
              <span className={`live-dot ${isRunning ? 'is-live' : ''}`} />
              <div>
                <span className="eyebrow">{isRunning ? 'Live match' : gameStateLabel(payload.map?.game_state)}</span>
                <strong>{gameStateLabel(payload.map?.game_state)}</strong>
              </div>
            </div>
            <div className="live-topline-metrics">
              <span><Clock3 size={14} /> {clockText(clock)}</span>
              <span><Swords size={14} /> {teamLabel(ownTeam)}</span>
              <span>{payload.map?.matchid ? `Match ${payload.map.matchid}` : 'Local game'}</span>
              <span className="muted-label">{lastSeen ? `Last signal ${lastSeen}` : 'Waiting for signal'}</span>
            </div>
          </section>

          <div className="live-layout">
            <div className="live-main">
              <section className="panel live-hero-card">
                <div className="live-hero-art" style={{ backgroundImage: hero ? `url(${heroImage(hero.img)})` : undefined }}>
                  {hero ? <HeroPortrait hero={hero} size="xl" /> : <div className="live-hero-placeholder">?</div>}
                </div>
                <div className="live-hero-copy">
                  <div className="live-hero-name-line">
                    <div>
                      <p className="eyebrow">{hero ? 'Your hero' : 'Hero not mapped yet'}</p>
                      <h2>{hero?.localized_name ?? 'Waiting for hero data'}</h2>
                      {hero && <span className="live-role-line">{hero.roles.join(' · ')}</span>}
                    </div>
                    <span className="live-level">Lv {payload.hero?.level ?? '—'}</span>
                  </div>
                  <div className="live-bars">
                    <div className="live-bar-row">
                      <span>HP</span>
                      <div className="live-meter"><i className="live-meter-hp" style={{ width: `${hpPercent}%` }} /></div>
                      <strong>{payload.hero?.health ?? '—'} / {payload.hero?.max_health ?? '—'}</strong>
                    </div>
                    <div className="live-bar-row">
                      <span>MP</span>
                      <div className="live-meter"><i className="live-meter-mp" style={{ width: `${mpPercent}%` }} /></div>
                      <strong>{payload.hero?.mana ?? '—'} / {payload.hero?.max_mana ?? '—'}</strong>
                    </div>
                  </div>
                  <div className="live-stat-row">
                    <div><span>K / D / A</span><strong>{payload.player?.kills ?? 0} / {payload.player?.deaths ?? 0} / {payload.player?.assists ?? 0}</strong></div>
                    <div><span>Net worth</span><strong>{formatCompact(payload.player?.net_worth ?? 0)}</strong></div>
                    <div><span>GPM</span><strong>{formatNumber(payload.player?.gpm ?? 0)}</strong></div>
                    <div><span>XPM</span><strong>{formatNumber(payload.player?.xpm ?? 0)}</strong></div>
                    <div><span>Last hits</span><strong>{formatNumber(payload.player?.last_hits ?? 0)}</strong></div>
                  </div>
                </div>
              </section>

              <section className="panel live-inventory-panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">ON THE HERO</p>
                    <h2>Your inventory</h2>
                  </div>
                  <span className="panel-chip">{ownItems.length}/6 slots</span>
                </div>
                <div className="live-inventory">
                  {Array.from({ length: 6 }, (_, slot) => {
                    const item = ownItems.find((entry) => entry.slot === slot)
                    const constant = item ? itemByKey.get(item.key) : null
                    return (
                      <div className={`live-inventory-slot ${constant ? 'is-filled' : ''}`} key={slot}>
                        {constant ? (
                          <>
                            <img src={itemImage(constant.img)} alt={constant.dname} />
                            <span>{constant.dname}</span>
                          </>
                        ) : (
                          <span className="live-inventory-empty">Empty</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="panel live-draft-panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">READ THE DRAFT</p>
                    <h2>Who you're up against</h2>
                  </div>
                  <span className="panel-chip">Game State Integration</span>
                </div>
                <div className="live-draft-grid">
                  <div className="live-draft-side">
                    <span className="live-draft-label">Your side · {teamLabel(ownTeam)}</span>
                    <div className="live-draft-slots">
                      {draftSlots(meta.heroes, allyIds).map((entry, index) => (
                        <div className="live-draft-slot" key={`ally-${index}`}>
                          {entry ? <HeroPortrait hero={entry} size="sm" /> : <span>?</span>}
                          <strong>{entry?.localized_name ?? 'Unknown'}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="live-draft-side">
                    <span className="live-draft-label">Enemy side</span>
                    <div className="live-draft-slots">
                      {draftSlots(meta.heroes, enemyIds).map((entry, index) => (
                        <div className="live-draft-slot" key={`enemy-${index}`}>
                          {entry ? <HeroPortrait hero={entry} size="sm" /> : <span>?</span>}
                          <strong>{entry?.localized_name ?? 'Unknown'}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {enemyIds.length > 0 && (
                  <p className="live-draft-threats">
                    Threat tags: {THREAT_GROUPS.filter((group) => enemyHeroes.some((enemy) => group.heroes.has(enemy.localized_name))).map((group) => group.label).join(' · ') || 'no obvious tag'}
                  </p>
                )}
              </section>
            </div>

            <aside className="live-side">
              <section className="panel live-suggestions">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">NEXT BUY</p>
                    <h2>Suggestions</h2>
                  </div>
                  <span className="panel-chip">{phase.label}</span>
                </div>
                {popularity.loading || itemConstants.loading ? (
                  <div className="live-suggestions-loading"><PageLoader label="Reading meta builds" /></div>
                ) : suggestions.length ? (
                  <div className="live-suggestions-list">
                    {suggestions.map((suggestion, index) => (
                      <div className={`live-suggestion ${suggestion.counter ? 'is-counter' : ''}`} key={suggestion.key}>
                        <span className="live-suggestion-rank">{String(index + 1).padStart(2, '0')}</span>
                        <img src={itemImage(suggestion.item.img)} alt={suggestion.item.dname} loading="lazy" />
                        <div className="live-suggestion-copy">
                          <strong>{suggestion.item.dname}</strong>
                          <span>{formatNumber(suggestion.item.cost)} gold</span>
                          <p>{suggestion.reason}</p>
                        </div>
                        {suggestion.counter && <span className="live-counter-mark">COUNTER</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="live-suggestions-empty">
                    <ShoppingBag size={22} />
                    <strong>No clear upgrade yet.</strong>
                    <p>Pick a hero and let the item sample load, or check again after a few more game minutes.</p>
                  </div>
                )}
                <p className="panel-footnote">
                  Heuristics, not orders. Enemy inventories are not exposed in a normal game; suggestions blend your
                  hero's public item popularity with the visible enemy draft and owned items.
                </p>
              </section>

              <section className="panel live-context-panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">SCOPE CONTEXT</p>
                    <h2>What the game shares</h2>
                  </div>
                  <Eye size={17} className="text-muted" />
                </div>
                <ul className="live-context-list">
                  <li><ShieldCheck size={14} /> Your inventory, stats and hero state are local.</li>
                  <li><Swords size={14} /> Draft heroes come from the official GSI feed.</li>
                  <li><Activity size={14} /> All-player inventories only appear while spectating.</li>
                  <li><Sparkles size={14} /> Suggestions are calculated on this device.</li>
                </ul>
                <p className="aside-note">
                  OpenDota benchmarks are not part of this feed. Hero item popularity is a public sample; treat it as a
                  starting point, not a script.
                </p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
