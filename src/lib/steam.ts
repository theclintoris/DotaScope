const STEAM_ACCOUNT_BASE = 76561197960265728n
const OPENID_NS = 'http://specs.openid.net/auth/2.0'

export interface SteamIdentity {
  accountId: number
  steamId64: string
  source: 'openid' | 'native'
}

export function steamAccountId(steamId64: string): number | null {
  if (!/^\d{17}$/.test(steamId64)) return null
  try {
    const accountId = BigInt(steamId64) - STEAM_ACCOUNT_BASE
    if (accountId <= 0n || accountId > 4294967295n) return null
    return Number(accountId)
  } catch {
    return null
  }
}

export function steamIdFromProfileUrl(value: string): string | null {
  const trimmed = value.trim()
  const profileMatch = trimmed.match(/(?:steamcommunity\.com\/profiles\/)(\d{17})/i)
  if (profileMatch) return profileMatch[1]
  if (/^\d{17}$/.test(trimmed)) return trimmed
  return null
}

export function readSteamIdentity(): SteamIdentity | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const claimedId = params.get('openid.claimed_id')
  const steamIdParam = params.get('steamid64')
  const source: SteamIdentity['source'] = claimedId ? 'openid' : 'native'
  const steamId64 = claimedId?.match(/\/id\/(\d{17})$/)?.[1] ?? steamIdParam
  if (!steamId64) return null
  const accountId = steamAccountId(steamId64)
  if (!accountId) return null
  return { accountId, steamId64, source }
}

export function consumeSteamParams(navigateToProfile: number | null) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const key of [...url.searchParams.keys()]) {
    if (key === 'openid.ns' || key === 'openid.mode' || key === 'openid.op_endpoint'
      || key === 'openid.claimed_id' || key === 'openid.identity' || key === 'openid.return_to'
      || key === 'openid.response_nonce' || key === 'openid.assoc_handle' || key === 'openid.signed'
      || key === 'openid.sig' || key === 'steamid64' || key === 'steam_auth') {
      url.searchParams.delete(key)
    }
  }
  history.replaceState(null, '', `${url.pathname}${url.search}${navigateToProfile ? '' : url.hash}`)
  if (navigateToProfile) window.location.hash = `/players/${navigateToProfile}`
}

export function buildSteamLoginUrl() {
  const returnTo = `${window.location.origin}${window.location.pathname}?steam_auth=1`
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': window.location.origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  })
  return `https://steamcommunity.com/openid/login?${params.toString()}`
}

export function isSteamOpenIdSupported() {
  if (typeof window === 'undefined') return false
  const capacitor = (window as typeof window & {
    Capacitor?: { isNativePlatform?: () => boolean }
  }).Capacitor
  if (capacitor?.isNativePlatform?.()) return false
  const params = new URLSearchParams(window.location.search)
  return params.get('runtime') !== 'desktop'
}
