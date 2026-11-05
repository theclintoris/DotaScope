import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, LogIn, RefreshCw } from 'lucide-react'
import { useProfile } from '../context/ProfileContext'
import { formatNumber, formatPercent } from '../lib/format'
import { rankLabel } from '../lib/constants'
import { PlayerAvatar, RankBadge } from './ui'
import { ProfileDialog } from './ProfileDialog'

function career(win: number, lose: number) {
  const games = win + lose
  return {
    games,
    winRate: games > 0 ? win / games : null,
  }
}

export function ProfileStrip() {
  const { profile, winLoss } = useProfile()
  const [open, setOpen] = useState(false)
  if (!profile) return null

  const stats = career(winLoss?.win ?? 0, winLoss?.lose ?? 0)
  return (
    <>
      <section className="profile-strip" aria-label="Your linked Dota profile">
        <div className="profile-strip-ident">
          <PlayerAvatar src={profile.profile.avatarfull} name={profile.profile.personaname} size="lg" />
          <div>
            <span className="eyebrow">YOUR DOSSIER</span>
            <h2>{profile.profile.personaname}</h2>
            <div className="profile-strip-meta">
              <RankBadge rankTier={profile.rank_tier} size="sm" showLabel />
              <span>{stats.games ? `${formatNumber(stats.games)} games` : 'Career sample syncing'}</span>
            </div>
          </div>
        </div>
        <div className="profile-strip-stats">
          <div><span className="muted-label">WIN RATE</span><strong>{stats.winRate === null ? '—' : formatPercent(stats.winRate)}</strong></div>
          <div><span className="muted-label">RECORD</span><strong>{formatNumber(winLoss?.win ?? 0)}–{formatNumber(winLoss?.lose ?? 0)}</strong></div>
          <div><span className="muted-label">MMR</span><strong>{profile.computed_mmr ? formatNumber(profile.computed_mmr) : '—'}</strong></div>
        </div>
        <div className="profile-strip-actions">
          <Link className="btn btn-sm btn-ghost" to={`/players/${profile.profile.account_id}`}>Open dossier <ChevronRight size={14} /></Link>
          <button className="btn btn-sm btn-quiet" type="button" onClick={() => setOpen(true)}>Manage</button>
        </div>
      </section>
      <ProfileDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function YourProfilePanel() {
  const { profile, winLoss, connecting, refresh } = useProfile()
  const [open, setOpen] = useState(false)

  if (!profile) {
    return (
      <>
        <section className="profile-connect-panel">
          <div className="profile-connect-icon"><LogIn size={22} /></div>
          <div>
            <span className="eyebrow">YOUR DOSSIER</span>
            <h2>Pin your profile to the top.</h2>
            <p>Sign in with Steam once and DotaScope will always start here with your career record, heroes and recent form.</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>Sign in with Steam</button>
        </section>
        <ProfileDialog open={open} onClose={() => setOpen(false)} />
      </>
    )
  }

  const stats = career(winLoss?.win ?? 0, winLoss?.lose ?? 0)
  const rank = profile.rank_tier ? rankLabel(profile.rank_tier) : 'Uncalibrated'
  return (
    <>
      <section className="your-profile-panel" aria-label="Your pinned profile">
        <PlayerAvatar src={profile.profile.avatarfull} name={profile.profile.personaname} size="xl" />
        <div className="your-profile-copy">
          <span className="eyebrow">PINNED PROFILE</span>
          <h2>{profile.profile.personaname}</h2>
          <div className="your-profile-meta">
            <RankBadge rankTier={profile.rank_tier} size="md" showLabel />
            <span className="badge badge-muted">Account {profile.profile.account_id}</span>
            {profile.profile.loccountrycode ? <span className="badge">{profile.profile.loccountrycode}</span> : null}
          </div>
          <p>{rank} · {formatNumber(stats.games)} career games · {profile.computed_mmr ? `${formatNumber(profile.computed_mmr)} computed MMR` : 'MMR unavailable'}</p>
          <div className="your-profile-actions">
            <Link className="btn btn-primary btn-sm" to={`/players/${profile.profile.account_id}`}>Open my dossier <ChevronRight size={14} /></Link>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(true)}>Switch profile</button>
            <button className="btn btn-quiet btn-sm" type="button" onClick={() => { void refresh() }} disabled={connecting}>
              <RefreshCw size={14} /> {connecting ? 'Syncing…' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="your-profile-stats">
          <div><span className="muted-label">WIN RATE</span><strong>{stats.winRate === null ? '—' : formatPercent(stats.winRate)}</strong></div>
          <div><span className="muted-label">RECORD</span><strong>{formatNumber(winLoss?.win ?? 0)}–{formatNumber(winLoss?.lose ?? 0)}</strong></div>
          <div><span className="muted-label">COMPUTED MMR</span><strong>{profile.computed_mmr ? formatNumber(profile.computed_mmr) : '—'}</strong></div>
        </div>
      </section>
      <ProfileDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
