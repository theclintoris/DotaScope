import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  Cpu,
  Crosshair,
  Database,
  Ellipsis,
  LogIn,
  Medal,
  MonitorDown,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useMeta } from '../context/MetaContext'
import { useProfile } from '../context/ProfileContext'
import { useInstallPrompt, useInterval, useLockBodyScroll, useOnlineStatus } from '../lib/hooks'
import { classNames, timeAgo } from '../lib/format'
import { isNativeGsiHost } from '../lib/gsi'
import { isNativeShell } from '../lib/pwa'
import { syncSharedTurboHistory } from '../lib/sharedArchive'
import { IMMORTAL_ATTRIBUTION } from '../lib/spectral'
import { Brand } from './Brand'
import { MetaLens } from './MetaLens'
import { CommandPalette } from './CommandPalette'
import { AutoParserWatcher } from './AutoParserWatcher'
import { InstallDialog } from './InstallDialog'
import { ProfileDialog } from './ProfileDialog'
import { PlayerAvatar, RankBadge } from './ui'

type NavigationItem = {
  to: string
  label: string
  icon: typeof Activity
  mobile?: boolean
}

const NAV_GROUPS: { label: string; items: NavigationItem[] }[] = [
  {
    label: 'Tracking',
    items: [
      { to: '/', label: 'Overview', icon: Activity, mobile: true },
      { to: '/matches', label: 'Matches', icon: Swords, mobile: true },
      { to: '/players', label: 'Players', icon: Users, mobile: true },
      { to: '/records', label: 'Records', icon: Medal },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { to: '/heroes', label: 'Heroes', icon: Shield, mobile: true },
      { to: '/draft', label: 'Draft lab', icon: Crosshair },
      { to: '/meta-escape', label: 'Meta escape', icon: Sparkles },
      { to: '/pro', label: 'Pro scene', icon: Trophy },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/data-lab', label: 'Data lab', icon: Database },
      { to: '/parser', label: 'Parser lab', icon: Cpu },
    ],
  },
]
const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items)
const MOBILE_ITEMS = NAV_ITEMS.filter((item) => item.mobile)
const MORE_ITEMS = NAV_ITEMS.filter((item) => !item.mobile)

function NavigationLink({ item, mobile, onClick }: {
  item: NavigationItem
  mobile?: boolean
  onClick?: () => void
}) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => classNames(mobile ? 'tab-link' : 'side-link', isActive && 'is-active')}
      onClick={onClick}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  )
}

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

export function AppShell() {
  const { pathname } = useLocation()
  const online = useOnlineStatus()
  const meta = useMeta()
  const { accountId, profile, connecting: profileConnecting, error: profileError } = useProfile()
  const { canInstall, installed, install } = useInstallPrompt()
  const [commandOpen, setCommandOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [, setTick] = useState(0)
  const syncedAccount = useRef<number | null>(null)
  const moreDialog = useRef<HTMLDialogElement>(null)
  const moreActive = MORE_ITEMS.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`))
  const syncLabel = meta.lastUpdated ? `Synced ${timeAgo(meta.lastUpdated / 1000)}` : undefined

  useInterval(() => setTick((tick) => tick + 1), 60_000)
  useLockBodyScroll(moreOpen)

  useEffect(() => {
    if (!accountId || !isNativeGsiHost() || syncedAccount.current === accountId) return
    syncedAccount.current = accountId
    void syncSharedTurboHistory(accountId)
  }, [accountId])

  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  useEffect(() => {
    const dialog = moreDialog.current
    if (!moreOpen || !dialog) return
    dialog.showModal()
    // More is only available while the mobile tab bar is visible.
    const desktop = window.matchMedia('(min-width: 981px)')
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMoreOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      desktop.removeEventListener('change', closeOnDesktop)
      dialog.close()
    }
  }, [moreOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setMoreOpen(false)
        setCommandOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openInstall = () => {
    setMoreOpen(false)
    if (canInstall) {
      void install()
    } else {
      setInstallOpen(true)
    }
  }

  const account = (
    <div className="sidebar-account">
      {profile && accountId ? (
        <Link className="sidebar-profile" to={`/players/${accountId}`} onClick={() => setMoreOpen(false)}>
          <PlayerAvatar src={profile.profile.avatarfull} name={profile.profile.personaname} size="sm" />
          <span className="sidebar-profile-copy">
            <strong>{profile.profile.personaname}</strong>
            <small>My profile</small>
          </span>
          <RankBadge rankTier={profile.rank_tier} size="sm" />
        </Link>
      ) : (
        <button
          type="button"
          className="sidebar-signin"
          disabled={profileConnecting}
          onClick={() => {
            setMoreOpen(false)
            setProfileOpen(true)
          }}
        >
          <LogIn size={16} aria-hidden="true" />
          <strong>{profileConnecting ? 'Syncing Steam…' : 'Sign in with Steam'}</strong>
        </button>
      )}
      {profileError && <span className="sidebar-profile-error">{profileError}</span>}
      {!installed && !isNativeShell() && (
        <button type="button" className="install-btn" onClick={openInstall}>
          <MonitorDown size={16} aria-hidden="true" />
          Install DotaScope
        </button>
      )}
    </div>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand /></div>
        <div className="sidebar-scroll">
          <nav className="side-nav" aria-label="Primary navigation">
            {NAV_GROUPS.map((group) => (
              <div className="side-nav-group" key={group.label}>
                <p className="sidebar-label">{group.label}</p>
                {group.items.map((item) => <NavigationLink key={item.to} item={item} />)}
              </div>
            ))}
          </nav>
          {account}
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-mobile-brand"><Brand compact /></div>
          <button
            type="button"
            className="search-trigger"
            onClick={() => setCommandOpen(true)}
            aria-label="Search heroes, players, or a match ID"
          >
            <Search size={17} />
            <span>Search heroes, players, match ID…</span>
            <kbd>Ctrl K</kbd>
          </button>

          <MetaLens />

          <div className="topbar-actions">
            {syncLabel && <span className="sync-time">{syncLabel}</span>}
            <button
              type="button"
              className="icon-btn"
              onClick={meta.refresh}
              disabled={meta.loading}
              aria-label="Refresh meta data"
              title={syncLabel ? `Refresh meta data · ${syncLabel}` : 'Refresh meta data'}
            >
              <RefreshCw size={16} className={meta.loading ? 'spin' : undefined} />
            </button>
          </div>
        </header>

        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={15} />
            <span>Offline. Cached OpenDota data is available on some pages.</span>
          </div>
        )}

        <main className="page" id="main-content">
          <Outlet />
        </main>

        <footer className="app-footer">
          <a href="https://www.opendota.com" target="_blank" rel="noreferrer">Data by OpenDota</a>
          {meta.population === 'immortal' && (
            <a href={IMMORTAL_ATTRIBUTION} target="_blank" rel="noreferrer">Immortal data by Spectral</a>
          )}
          <span>Unofficial Dota 2 tracker</span>
        </footer>
      </div>

      <nav className="mobile-tabbar" aria-label="Mobile navigation">
        {MOBILE_ITEMS.map((item) => <NavigationLink key={item.to} item={item} mobile />)}
        <button
          type="button"
          className={classNames('tab-link', (moreOpen || moreActive) && 'is-active')}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <Ellipsis size={19} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      <AutoParserWatcher />
      <InstallDialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        canInstall={canInstall}
        installed={installed}
        onInstall={install}
      />

      {moreOpen && (
        <dialog
          className="mobile-sheet"
          ref={moreDialog}
          aria-labelledby="more-title"
          onCancel={(event) => {
            event.preventDefault()
            setMoreOpen(false)
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return
            const bounds = event.currentTarget.getBoundingClientRect()
            if (event.clientY < bounds.top) setMoreOpen(false)
          }}
        >
          <div className="sheet-head">
            <h2 id="more-title">More</h2>
            <button type="button" className="icon-btn" onClick={() => setMoreOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          <div className="sheet-scroll">
            <nav className="sheet-links" aria-label="More pages">
              {MORE_ITEMS.map((item) => (
                <NavigationLink key={item.to} item={item} onClick={() => setMoreOpen(false)} />
              ))}
            </nav>
            {account}
          </div>
        </dialog>
      )}
    </div>
  )
}
