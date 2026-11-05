import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Command,
  Database,
  Radio,
  Search,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import type { SearchPlayer } from '../types'
import { useMeta } from '../context/MetaContext'
import { useDebouncedValue, useLockBodyScroll, usePersistentState } from '../lib/hooks'
import { fetchSearchPlayers } from '../lib/api'
import { heroImage } from '../lib/constants'
import { classNames } from '../lib/format'

interface PaletteAction {
  id: string
  title: string
  meta?: string
  icon?: ReactNode
  image?: string
  to: string
  isPlayer?: boolean
}

interface PaletteSection {
  title: string
  actions: PaletteAction[]
}

const QUICK_LINKS: PaletteAction[] = [
  { id: 'nav-home', title: 'Overview', meta: 'Meta snapshot', icon: <Activity size={16} />, to: '/' },
  { id: 'nav-heroes', title: 'Heroes', meta: 'All heroes, every filter', icon: <Swords size={16} />, to: '/heroes' },
  { id: 'nav-draft', title: 'Draft lab', meta: 'Counter-pick simulator', icon: <Swords size={16} />, to: '/draft' },
  { id: 'nav-live', title: 'Live suggestions', meta: 'Read a running Dota game', icon: <Radio size={16} />, to: '/live' },
  { id: 'nav-meta-escape', title: 'Meta escape', meta: 'Underplayed heroes & items', icon: <Sparkles size={16} />, to: '/meta-escape' },
  { id: 'nav-matches', title: 'Matches', meta: 'Pro & public feed', icon: <Swords size={16} />, to: '/matches' },
  { id: 'nav-players', title: 'Players', meta: 'Search any account', icon: <Users size={16} />, to: '/players' },
  { id: 'nav-pro', title: 'Pro scene', meta: 'Teams & pro meta', icon: <Trophy size={16} />, to: '/pro' },
  { id: 'nav-records', title: 'Records', meta: 'Hall of fame', icon: <Trophy size={16} />, to: '/records' },
  { id: 'nav-lab', title: 'Data lab', meta: 'SQL explorer', icon: <Database size={16} />, to: '/data-lab' },
]

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { heroes } = useMeta()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [players, setPlayers] = useState<SearchPlayer[]>([])
  const [searching, setSearching] = useState(false)
  const [recent, setRecent] = usePersistentState<SearchPlayer[]>('dotascope.recentPlayers.v1', [])
  const debounced = useDebouncedValue(query, 310)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    const trimmed = debounced.trim()
    if (trimmed.length < 2) {
      setPlayers([])
      setSearching(false)
      return
    }
    let active = true
    setSearching(true)
    fetchSearchPlayers(trimmed)
      .then((results) => {
        if (active) setPlayers(results.slice(0, 6))
      })
      .catch(() => {
        if (active) setPlayers([])
      })
      .finally(() => {
        if (active) setSearching(false)
      })
    return () => {
      active = false
    }
  }, [debounced])

  const sections = useMemo<PaletteSection[]>(() => {
    const trimmed = query.trim()
    const lower = trimmed.toLowerCase()
    const groups: PaletteSection[] = []

    if (!trimmed) {
      if (recent.length) {
        groups.push({
          title: 'Recent players',
          actions: recent.slice(0, 4).map((player) => ({
            id: `recent-${player.account_id}`,
            title: player.personaname || `Account ${player.account_id}`,
            meta: `Account ${player.account_id}`,
            image: player.avatarfull,
            to: `/players/${player.account_id}`,
            isPlayer: true,
          })),
        })
      }
      groups.push({ title: 'Jump to', actions: QUICK_LINKS })
      return groups
    }

    if (/^\d{5,}$/.test(trimmed)) {
      groups.push({
        title: 'Match',
        actions: [
          {
            id: 'match-id',
            title: `Match ${trimmed}`,
            meta: 'Open scoreboard',
            icon: <ArrowRight size={16} />,
            to: `/matches/${trimmed}`,
          },
        ],
      })
    }

    const heroMatches = heroes
      .filter((hero) => {
        const haystack = `${hero.localized_name} ${hero.name} ${hero.roles.join(' ')}`.toLowerCase()
        return haystack.includes(lower)
      })
      .slice(0, 5)
      .map((hero) => ({
        id: `hero-${hero.id}`,
        title: hero.localized_name,
        meta: hero.roles.slice(0, 3).join(' · '),
        image: heroImage(hero.img),
        to: `/heroes/${hero.id}`,
      }))
    if (heroMatches.length) groups.push({ title: 'Heroes', actions: heroMatches })

    if (players.length) {
      groups.push({
        title: 'Players',
        actions: players.map((player) => ({
          id: `player-${player.account_id}`,
          title: player.personaname || `Account ${player.account_id}`,
          meta: player.last_match_time
            ? `Last played ${new Date(player.last_match_time).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}`
            : `Account ${player.account_id}`,
          image: player.avatarfull,
          to: `/players/${player.account_id}`,
          isPlayer: true,
        })),
      })
    }

    return groups
  }, [query, heroes, players, recent])

  const flat = useMemo(() => sections.flatMap((section) => section.actions), [sections])

  useEffect(() => {
    setIndex(0)
  }, [query, players.length, heroes.length])

  useEffect(() => {
    if (!open) return
    const element = listRef.current?.querySelector<HTMLElement>(`[data-action-index="${index}"]`)
    element?.scrollIntoView({ block: 'nearest' })
  }, [index, open])

  if (!open) return null

  const choose = (action: PaletteAction) => {
    if (action.isPlayer) {
      const accountId = Number(action.id.split('-').slice(1).join('-'))
      const player = players.find((entry) => entry.account_id === accountId) ??
        recent.find((entry) => entry.account_id === accountId)
      if (player) {
        const next = [player, ...recent.filter((entry) => entry.account_id !== player.account_id)].slice(0, 8)
        setRecent(next)
      }
    }
    onClose()
    navigate(action.to)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex((current) => Math.min(flat.length - 1, current + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex((current) => Math.max(0, current - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const action = flat[index]
      if (action) choose(action)
    }
  }

  let cursor = -1

  return (
    <div className="overlay command-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="command-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input-row">
          <Search size={19} className="command-search-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search heroes, players, or match ID…"
            aria-label="Search heroes, players, or match ID"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="key-hint">ESC</kbd>
          <button type="button" className="icon-btn command-close" onClick={onClose} aria-label="Close search">
            <X size={18} />
          </button>
        </div>

        <div className="command-results" ref={listRef}>
          {searching && (
            <div className="command-searching">
              <span className="live-dot" /> Searching OpenDota players…
            </div>
          )}
          {sections.map((section) => (
            <div className="command-section" key={section.title}>
              <div className="command-section-title">{section.title}</div>
              {section.actions.map((action) => {
                cursor += 1
                const actionIndex = cursor
                const active = actionIndex === index
                return (
                  <button
                    type="button"
                    key={action.id}
                    data-action-index={actionIndex}
                    className={classNames('command-item', active && 'is-active')}
                    onMouseEnter={() => setIndex(actionIndex)}
                    onClick={() => choose(action)}
                  >
                    <span className="command-item-icon">
                      {action.image ? (
                        <img src={action.image} alt="" loading="lazy" />
                      ) : (
                        action.icon ?? <UserRound size={16} />
                      )}
                    </span>
                    <span className="command-item-copy">
                      <strong>{action.title}</strong>
                      {action.meta && <small>{action.meta}</small>}
                    </span>
                    <ArrowRight size={14} className="command-item-arrow" />
                  </button>
                )
              })}
            </div>
          ))}
          {!flat.length && (
            <div className="command-empty">
              <span className="state-icon">
                <Search size={20} />
              </span>
              <strong>No matches in the observatory</strong>
              <p>Try a hero name, a Steam persona, or a Dota match ID.</p>
            </div>
          )}
        </div>

        <div className="command-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span className="command-brand">
            <Command size={12} /> DotaScope
          </span>
        </div>
      </div>
    </div>
  )
}
