import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchPlayer, fetchPlayerWinLoss } from '../lib/api'
import { consumeSteamParams, readSteamIdentity } from '../lib/steam'
import type { PlayerProfile, PlayerWinLoss } from '../types'

const PROFILE_KEY = 'dotascope.profile.v1'

interface StoredProfile {
  accountId: number
  profile: PlayerProfile
  winLoss: PlayerWinLoss | null
  savedAt: number
}

interface ProfileContextValue {
  accountId: number | null
  profile: PlayerProfile | null
  winLoss: PlayerWinLoss | null
  savedAt: number | null
  connecting: boolean
  error: string | null
  connect: (accountId: number) => Promise<void>
  refresh: () => Promise<void>
  disconnect: () => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function readStoredProfile(): StoredProfile | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredProfile>
    if (
      typeof parsed.accountId !== 'number' ||
      !parsed.profile?.profile?.personaname ||
      typeof parsed.profile.profile.account_id !== 'number'
    ) {
      return null
    }
    return {
      accountId: parsed.accountId,
      profile: parsed.profile,
      winLoss: parsed.winLoss ?? null,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    }
  } catch {
    return null
  }
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Could not load that profile. Check the account ID and try again.'
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredProfile | null>(readStoredProfile)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const steamBootRef = useRef(false)

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === PROFILE_KEY) setStored(readStoredProfile())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const persist = useCallback((next: StoredProfile | null) => {
    setStored(next)
    if (typeof localStorage === 'undefined') return
    if (next) localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
    else localStorage.removeItem(PROFILE_KEY)
  }, [])

  const load = useCallback(async (accountId: number, savedAt = Date.now()) => {
    const [profile, winLoss] = await Promise.all([
      fetchPlayer(String(accountId)),
      fetchPlayerWinLoss(String(accountId)).catch(() => null),
    ])
    if (profile.profile.account_id !== accountId) {
      throw new Error('OpenDota returned a different account for that ID.')
    }
    const next: StoredProfile = { accountId, profile, winLoss, savedAt }
    persist(next)
    setError(null)
    return next
  }, [persist])

  useEffect(() => {
    if (steamBootRef.current) return
    const identity = readSteamIdentity()
    if (!identity) return
    steamBootRef.current = true
    if (stored?.accountId === identity.accountId) {
      consumeSteamParams(identity.source === 'openid' ? identity.accountId : null)
      return
    }
    setConnecting(true)
    setError(null)
    load(identity.accountId)
      .then(() => consumeSteamParams(identity.source === 'openid' ? identity.accountId : null))
      .catch((cause) => {
        setError(describeError(cause))
        consumeSteamParams(null)
      })
      .finally(() => setConnecting(false))
  }, [load, stored])

  const connect = useCallback(async (accountId: number) => {
    setConnecting(true)
    setError(null)
    try {
      await load(accountId)
    } catch (cause) {
      const message = describeError(cause)
      setError(message)
      throw new Error(message)
    } finally {
      setConnecting(false)
    }
  }, [load])

  const refresh = useCallback(async () => {
    if (!stored) return
    setConnecting(true)
    setError(null)
    try {
      await load(stored.accountId)
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setConnecting(false)
    }
  }, [load, stored])

  const disconnect = useCallback(() => {
    persist(null)
    setError(null)
  }, [persist])

  const value = useMemo<ProfileContextValue>(() => ({
    accountId: stored?.accountId ?? null,
    profile: stored?.profile ?? null,
    winLoss: stored?.winLoss ?? null,
    savedAt: stored?.savedAt ?? null,
    connecting,
    error,
    connect,
    refresh,
    disconnect,
  }), [stored, connecting, error, connect, refresh, disconnect])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfile must be used within ProfileProvider')
  return context
}

export { PROFILE_KEY }
