import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Gamepad2, LogIn, Search, UserRound, X } from 'lucide-react'
import { useProfile } from '../context/ProfileContext'
import { fetchSearchPlayers } from '../lib/api'
import { useLockBodyScroll } from '../lib/hooks'
import { buildSteamLoginUrl, isSteamOpenIdSupported, readSteamIdentity, steamAccountId, steamIdFromProfileUrl } from '../lib/steam'
import { formatNumber, formatPercent } from '../lib/format'
import { rankLabel } from '../lib/constants'
import type { SearchPlayer } from '../types'
import { PlayerAvatar, RankBadge, Spinner } from './ui'

interface ProfileDialogProps {
  open: boolean
  onClose: () => void
}

export function ProfileDialog({ open, onClose }: ProfileDialogProps) {
  const { accountId, profile, winLoss, connecting, error, connect, disconnect } = useProfile()
  const [value, setValue] = useState('')
  const [results, setResults] = useState<SearchPlayer[]>([])
  const [searching, setSearching] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const steamOpenId = isSteamOpenIdSupported()
  const detectedSteam = readSteamIdentity()

  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return
    setValue('')
    setResults([])
    setLocalError(null)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const lookup = async (query: string) => {
    setSearching(true)
    setLocalError(null)
    setResults([])
    try {
      const matches = await fetchSearchPlayers(query)
      setResults(matches.slice(0, 8))
      if (matches.length === 0) setLocalError('No public player matched that search. Try an account ID or a Steam profile URL.')
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Player search failed.')
    } finally {
      setSearching(false)
    }
  }

  const choose = async (id: number) => {
    setLocalError(null)
    try {
      await connect(id)
      onClose()
    } catch {
      // ProfileContext exposes the friendly error.
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = value.trim()
    if (!query) return
    const steamId = steamIdFromProfileUrl(query)
    if (steamId) {
      const id = steamAccountId(steamId)
      if (id) {
        await choose(id)
        return
      }
    }
    if (/^\d{1,12}$/.test(query)) {
      await choose(Number(query))
      return
    }
    await lookup(query)
  }

  const startSteamLogin = () => {
    window.location.assign(buildSteamLoginUrl())
  }

  return (
    <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close profile dialog">
          <X size={17} />
        </button>

        <div className="profile-dialog-head">
          <span className="eyebrow">PROFILE LINK</span>
          <h2 id="profile-dialog-title">Bring your dossier into focus.</h2>
          <p className="install-lede">
            Connect the Steam identity behind your Dota account. DotaScope reads your public
            OpenDota dossier — never your Steam password or private data.
          </p>
        </div>

        {profile && accountId ? (
          <div className="profile-connected">
            <PlayerAvatar src={profile.profile.avatarfull} name={profile.profile.personaname} size="lg" />
            <div className="profile-connected-copy">
              <span className="muted-label">CURRENTLY PINNED</span>
              <strong>{profile.profile.personaname}</strong>
              <span>
                {profile.rank_tier ? `${rankLabel(profile.rank_tier)} · ` : ''}
                {formatNumber((winLoss?.win ?? 0) + (winLoss?.lose ?? 0))} games
                {winLoss ? ` · ${formatPercent(winLoss.win / Math.max(1, winLoss.win + winLoss.lose))} win rate` : ''}
              </span>
            </div>
            <RankBadge rankTier={profile.rank_tier} size="md" />
          </div>
        ) : null}

        {steamOpenId ? (
          <button className="steam-login-btn" type="button" onClick={startSteamLogin} disabled={connecting}>
            <span className="steam-login-icon"><Gamepad2 size={20} /></span>
            <span>
              <strong>Sign in with Steam</strong>
              <small>Open Steam, then return with your public Dota profile.</small>
            </span>
            <LogIn size={17} />
          </button>
        ) : detectedSteam ? (
          <button
            className="steam-login-btn"
            type="button"
            onClick={() => { void choose(detectedSteam.accountId) }}
            disabled={connecting}
          >
            <span className="steam-login-icon"><Gamepad2 size={20} /></span>
            <span>
              <strong>Use this Steam account</strong>
              <small>Steam ID {detectedSteam.steamId64} is active on this PC.</small>
            </span>
            <LogIn size={17} />
          </button>
        ) : null}

        <div className="profile-divider"><span>or link a public profile</span></div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <label className="lens-label" htmlFor="profile-lookup">Steam profile URL, vanity, or Dota account ID</label>
          <div className="profile-search-row">
            <span className="input-wrap">
              <Search size={16} />
              <input
                id="profile-lookup"
                ref={inputRef}
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="e.g. 295731192 or steamcommunity.com/id/…"
                autoComplete="off"
                spellCheck={false}
              />
            </span>
            <button className="btn btn-primary" type="submit" disabled={searching || connecting || !value.trim()}>
              {searching || connecting ? <Spinner size={15} /> : 'Find profile'}
            </button>
          </div>
          <p className="profile-dialog-note">
            <UserRound size={13} /> Your selection is saved on this device. Steam sign-in uses your public
            Steam OpenID identity; no DotaScope account or password is created.
          </p>
        </form>

        {searching ? <div className="inline-loading"><Spinner size={15} /> Searching OpenDota players…</div> : null}

        {results.length > 0 ? (
          <div className="profile-results">
            <span className="muted-label">MATCHING PROFILES</span>
            {results.map((result) => (
              <button className="profile-result" type="button" key={result.account_id} onClick={() => { void choose(result.account_id) }} disabled={connecting}>
                <PlayerAvatar src={result.avatarfull} name={result.personaname} size="sm" />
                <span>
                  <strong>{result.personaname}</strong>
                  <small>Account {result.account_id}</small>
                </span>
                <span className="row-arrow">→</span>
              </button>
            ))}
          </div>
        ) : null}

        {localError || error ? (
          <p className="inline-alert">{localError ?? error}</p>
        ) : null}

        {profile && accountId ? (
          <div className="profile-dialog-actions">
            <a className="btn btn-ghost btn-sm" href={`#/players/${accountId}`} onClick={onClose}>Open dossier</a>
            <button className="btn btn-quiet btn-sm" type="button" onClick={disconnect}>Sign out</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
