import { useEffect, useState } from 'react'
import {
  Activity,
  BadgeCheck,
  ChevronRight,
  Crosshair,
  Database,
  Download,
  KeyRound,
  LayoutDashboard,
  LogIn,
  Medal,
  Menu,
  MonitorDown,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Swords,
  Trophy,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMeta } from '../context/MetaContext'
import { useProfile } from '../context/ProfileContext'
import { useInstallPrompt, useInterval, useLockBodyScroll, useOnlineStatus } from '../lib/hooks'
import { classNames, timeAgo } from '../lib/format'
import { Brand } from './Brand'
import { MetaLens } from './MetaLens'
import { CommandPalette } from './CommandPalette'
import { ApiKeyDialog } from './ApiKeyDialog'
import { InstallDialog } from './InstallDialog'
import { ProfileDialog } from './ProfileDialog'
import { PlayerAvatar, RankBadge } from './ui'

const NAV = [
  { to: '/', label: 'Overview', icon: Activity, end: true },
  { to: '/heroes', label: 'Heroes', icon: Swords },
  { to: '/draft', label: 'Draft lab', icon: Crosshair },
  { to: '/meta-escape', label: 'Meta escape', icon: Sparkles },
  { to: '/matches', label: 'Matches', icon: LayoutDashboard },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/pro', label: 'Pro scene', icon: Trophy },
  { to: '/records', label: 'Records', icon: Medal },
  { to: '/data-lab', label: 'Data lab', icon: Database },
]

const MORE_LINKS = [
  { to: '/draft', label: 'Draft lab', hint: 'Counter-pick simulator', icon: Crosshair },
  { to: '/meta-escape', label: 'Meta escape', hint: 'Underplayed heroes and items', icon: Sparkles },
  { to: '/pro', label: 'Pro scene', hint: 'Teams, drafts, pro meta', icon: Trophy },
  { to: '/records', label: 'Records', hint: 'The all-time leaderboards', icon: Medal },
  { to: '/data-lab', label: 'Data lab', hint: 'Query OpenDota directly', icon: Database },
]

const SECTION_META: { match: (path: string) => boolean; kicker: string; title: string }[] = [
  { match: (path) => path === '/', kicker: 'Command center', title: 'Overview' },
  { match: (path) => path.startsWith('/heroes/'), kicker: 'Hero dossier', title: 'Hero detail' },
  { match: (path) => path.startsWith('/heroes'), kicker: 'Meta index', title: 'Heroes' },
  { match: (path) => path.startsWith('/draft'), kicker: 'Draft intelligence', title: 'Draft lab' },
  { match: (path) => path.startsWith('/meta-escape'), kicker: 'Outside the meta', title: 'Meta escape' },
  { match: (path) => /^\/matches\/[^/]+/.test(path), kicker: 'Match dossier', title: 'Match detail' },
  { match: (path) => path.startsWith('/matches'), kicker: 'Live feed', title: 'Matches' },
  { match: (path) => /^\/players\/[^/]+\/heroes\/[^/]+/.test(path), kicker: 'Player hero', title: 'Hero dossier' },
  { match: (path) => path.startsWith('/players/'), kicker: 'Player dossier', title: 'Player profile' },
  { match: (path) => path.startsWith('/players'), kicker: 'Identity search', title: 'Players' },
  { match: (path) => path.startsWith('/pro'), kicker: 'Circuit intelligence', title: 'Pro scene' },
  { match: (path) => path.startsWith('/records'), kicker: 'Hall of records', title: 'Records' },
  { match: (path) => path.startsWith('/data-lab'), kicker: 'Open data', title: 'Data lab' },
]

function resolveSection(path: string) {
  return SECTION_META.find((entry) => entry.match(path)) ?? { kicker: 'DotaScope', title: 'Not found' }
}

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const meta = useMeta()
  const { accountId, profile, connecting: profileConnecting, error: profileError } = useProfile()
  const { canInstall, installed, install } = useInstallPrompt()
  const [commandOpen, setCommandOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [apiKeyOpen, setApiKeyOpen] = useState(false)
  const [, setTick] = useState(0)
  const section = resolveSection(location.pathname)
  const moreActive = MORE_LINKS.some((link) => location.pathname.startsWith(link.to))

  useInterval(() => setTick((tick) => tick + 1), 60_000)
  useLockBodyScroll(moreOpen)

  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const openApiKey = () => setApiKeyOpen(true)
    window.addEventListener('dotascope:open-api-key', openApiKey)
    return () => window.removeEventListener('dotascope:open-api-key', openApiKey)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openInstall = () => {
    if (installed) return
    if (canInstall) {
      void install().then((accepted) => {
        if (accepted) setMoreOpen(false)
      })
    } else {
      setInstallOpen(true)
      setMoreOpen(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <div className="sidebar-scroll">
          <span className="sidebar-label">Navigate</span>
          <nav className="side-nav" aria-label="Primary navigation">
            {NAV.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => classNames('side-link', isActive && 'is-active')}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  <ChevronRight size={13} className="side-link-arrow" />
                </NavLink>
              )
            })}
          </nav>

          <div className="sidebar-rule" />
          <MetaLens />

          <div className="sidebar-rule" />
          <div className="sidebar-account">
            <span className="sidebar-label">Profile</span>
            {profile && accountId ? (
              <Link className="sidebar-profile" to={`/players/${accountId}`}>
                <PlayerAvatar src={profile.profile.avatarfull} name={profile.profile.personaname} size="sm" />
                <span className="sidebar-profile-copy">
                  <strong>{profile.profile.personaname}</strong>
                  <small>Open my dossier</small>
                </span>
                <RankBadge rankTier={profile.rank_tier} size="sm" />
              </Link>
            ) : (
              <button
                type="button"
                className="sidebar-signin"
                onClick={() => setProfileOpen(true)}
                disabled={profileConnecting}
              >
                <span className="sidebar-signin-icon"><LogIn size={16} /></span>
                <span>
                  <strong>{profileConnecting ? 'Syncing Steam…' : 'Sign in with Steam'}</strong>
                  <small>Pin your dossier to the top</small>
                </span>
              </button>
            )}
            {profileError ? <span className="sidebar-profile-error">{profileError}</span> : null}
          </div>

          <div className="sidebar-rule" />
          <div className="sidebar-install">
            <span className="sidebar-label">App</span>
            {installed ? (
              <span className="installed-pill">
                <BadgeCheck size={14} /> Installed
              </span>
            ) : (
              <button type="button" className="install-btn" onClick={openInstall}>
                <span className="install-btn-icon">
                  <MonitorDown size={17} />
                </span>
                <span>
                  <strong>Install DotaScope</strong>
                  <small>PC &amp; Android</small>
                </span>
              </button>
            )}
            <div className="sidebar-credit">
              <span className="live-dot" />
              Data by OpenDota
            </div>
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-mobile-brand">
            <Brand compact />
          </div>
          <div className="topbar-context">
            <span className="topbar-kicker">{section.kicker}</span>
            <strong>{section.title}</strong>
          </div>

          <button
            type="button"
            className="search-trigger"
            onClick={() => setCommandOpen(true)}
            aria-label="Search heroes, players, or a match ID"
          >
            <Search size={16} />
            <span>Search heroes, players, match ID…</span>
            <kbd>Ctrl K</kbd>
          </button>

          <div className="topbar-actions">
            <span className={classNames('source-pill', !online && 'is-offline')}>
              <span className="live-dot" />
              <span className="source-pill-label">{online ? 'OpenDota live' : 'Offline cache'}</span>
            </span>
            {meta.lastUpdated && (
              <span className="sync-time">Synced {timeAgo(meta.lastUpdated / 1000)}</span>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={meta.refresh}
              aria-label="Refresh meta data"
              title="Refresh meta data"
            >
              <RefreshCw size={16} className={meta.loading ? 'spin' : undefined} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setApiKeyOpen(true)}
              aria-label="OpenDota API key"
              title="OpenDota API key"
            >
              <KeyRound size={16} />
            </button>
            <button
              type="button"
              className="icon-btn mobile-filter-btn"
              onClick={() => setMoreOpen(true)}
              aria-label="Open filters and more"
            >
              <SlidersHorizontal size={17} />
            </button>
            <button
              type="button"
              className="icon-btn menu-btn"
              onClick={() => setMoreOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
          </div>
        </header>

        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={15} />
            <span>
              You are offline. Showing the last OpenDota snapshot cached on this device — some pages may be
              limited.
            </span>
          </div>
        )}

        <main className="page" id="main-content">
          <Outlet />
        </main>

        <footer className="app-footer">
          <div>
            <strong>DOTASCOPE</strong>
            <span>Unofficial Dota 2 intelligence · built for PC &amp; Android</span>
          </div>
          <div className="app-footer-links">
            <a href="https://www.opendota.com" target="_blank" rel="noreferrer">
              Data by OpenDota
            </a>
            <span className="footer-sep">/</span>
            <span>Not affiliated with Valve</span>
          </div>
        </footer>
      </div>

      <nav className="mobile-tabbar" aria-label="Mobile navigation">
        <NavLink
          to="/"
          end
          className={({ isActive }) => classNames('tab-link', isActive && 'is-active')}
        >
          <Activity size={19} />
          <span>Home</span>
        </NavLink>
        <NavLink
          to="/heroes"
          className={({ isActive }) => classNames('tab-link', isActive && 'is-active')}
        >
          <Swords size={19} />
          <span>Heroes</span>
        </NavLink>
        <NavLink
          to="/matches"
          className={({ isActive }) => classNames('tab-link', isActive && 'is-active')}
        >
          <LayoutDashboard size={19} />
          <span>Matches</span>
        </NavLink>
        <NavLink
          to="/players"
          className={({ isActive }) => classNames('tab-link', isActive && 'is-active')}
        >
          <Users size={19} />
          <span>Players</span>
        </NavLink>
        <button
          type="button"
          className={classNames('tab-link', (moreOpen || moreActive) && 'is-active')}
          onClick={() => setMoreOpen(true)}
        >
          <Menu size={19} />
          <span>More</span>
        </button>
      </nav>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ApiKeyDialog open={apiKeyOpen} onClose={() => setApiKeyOpen(false)} />
      <InstallDialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        canInstall={canInstall}
        installed={installed}
        onInstall={install}
      />

      {moreOpen && (
        <div className="overlay sheet-overlay" role="presentation" onMouseDown={() => setMoreOpen(false)}>
          <div
            className="mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Menu and meta filters"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-head">
              <div>
                <span className="eyebrow">Explore &amp; tune</span>
                <h2>DotaScope menu</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setMoreOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>

            <div className="sheet-scroll">
              <div className="sheet-account">
                {profile && accountId ? (
                  <Link className="sheet-profile" to={`/players/${accountId}`} onClick={() => setMoreOpen(false)}>
                    <PlayerAvatar src={profile.profile.avatarfull} name={profile.profile.personaname} size="md" />
                    <span>
                      <span className="eyebrow">PINNED PROFILE</span>
                      <strong>{profile.profile.personaname}</strong>
                      <small>Open my dossier</small>
                    </span>
                    <RankBadge rankTier={profile.rank_tier} size="sm" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="sheet-signin"
                    onClick={() => {
                      setMoreOpen(false)
                      setProfileOpen(true)
                    }}
                  >
                    <LogIn size={18} />
                    <span>
                      <strong>{profileConnecting ? 'Syncing Steam…' : 'Sign in with Steam'}</strong>
                      <small>Pin your public profile to Players</small>
                    </span>
                  </button>
                )}
              </div>

              <div className="sheet-links">
                {MORE_LINKS.map((link) => {
                  const Icon = link.icon
                  return (
                    <Link key={link.to} to={link.to} className="sheet-link">
                      <span className="sheet-link-icon">
                        <Icon size={18} />
                      </span>
                      <span>
                        <strong>{link.label}</strong>
                        <small>{link.hint}</small>
                      </span>
                      <ChevronRight size={15} />
                    </Link>
                  )
                })}
              </div>

              <MetaLens compact />

              <div className="sheet-install">
                {installed ? (
                  <span className="installed-pill">
                    <BadgeCheck size={15} /> Installed on this device
                  </span>
                ) : (
                  <button type="button" className="btn btn-primary btn-wide" onClick={openInstall}>
                    <Download size={15} /> Install on PC &amp; Android
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-wide"
                  onClick={() => {
                    setMoreOpen(false)
                    navigate('/data-lab')
                  }}
                >
                  <Database size={15} /> Open SQL data lab
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-wide"
                  onClick={() => {
                    setMoreOpen(false)
                    setApiKeyOpen(true)
                  }}
                >
                  <KeyRound size={15} /> OpenDota API key
                </button>
              </div>

              <div className="sheet-credit">
                <Smartphone size={14} />
                <span>One responsive app · desktop, tablet, Android homescreen</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
