import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { apiGet, TTL } from './api'

interface RemoteState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  lastUpdated: number | null
}

export function useRemote<T>(path: string | null, ttl: number = TTL.feed) {
  const [state, setState] = useState<RemoteState<T>>({
    data: null,
    loading: Boolean(path),
    error: null,
    lastUpdated: null,
  })
  const [nonce, setNonce] = useState(0)
  const forceNext = useRef(false)
  const pathRef = useRef(path)

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null, lastUpdated: null })
      return
    }
    let cancelled = false
    const changed = pathRef.current !== path
    pathRef.current = path
    setState((previous) => ({
      data: changed ? null : previous.data,
      loading: true,
      error: null,
      lastUpdated: changed ? null : previous.lastUpdated,
    }))
    apiGet<T>(path, { ttl, force: forceNext.current })
      .then((data) => {
        if (cancelled) return
        forceNext.current = false
        setState({ data, loading: false, error: null, lastUpdated: Date.now() })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        forceNext.current = false
        setState((previous) => ({
          ...previous,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        }))
      })
    return () => {
      cancelled = true
    }
  }, [path, ttl, nonce])

  const refresh = useCallback(() => {
    forceNext.current = true
    setNonce((value) => value + 1)
  }, [])

  return { ...state, refresh }
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof localStorage === 'undefined') return initialValue
    try {
      const stored = localStorage.getItem(key)
      return stored ? (JSON.parse(stored) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage may be disabled; state still works for this session.
    }
  }, [key, value])

  return [value, setValue] as const
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title === 'DotaScope' ? title : `${title} · DotaScope`
  }, [title])
}

let bodyScrollLocks = 0
let previousBodyOverflow = ''

export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    if (bodyScrollLocks === 0) {
      previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    bodyScrollLocks += 1
    return () => {
      bodyScrollLocks = Math.max(0, bodyScrollLocks - 1)
      if (bodyScrollLocks === 0) {
        document.body.style.overflow = previousBodyOverflow
      }
    }
  }, [locked])
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const media = window.matchMedia(query)
    const listener = () => setMatches(media.matches)
    listener()
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])
  return matches
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function useInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(display-mode: standalone)').matches
  })

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!installEvent) return false
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') {
      setInstallEvent(null)
      return true
    }
    return false
  }, [installEvent])

  return { canInstall: Boolean(installEvent) && !installed, installed, install }
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function useInterval(callback: () => void, delay: number | null) {
  const ref = useRef(callback)
  useEffect(() => {
    ref.current = callback
  }, [callback])
  useEffect(() => {
    if (delay == null) return
    const id = window.setInterval(() => ref.current(), delay)
    return () => window.clearInterval(id)
  }, [delay])
}

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)
    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [ref, handler, active])
}
