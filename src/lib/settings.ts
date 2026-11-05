const API_KEY_STORAGE = 'dotascope.opendotaKey.v1'

export function getOpenDotaKey(): string {
  if (typeof localStorage === 'undefined') return ''
  try {
    return localStorage.getItem(API_KEY_STORAGE)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function hasOpenDotaKey(): boolean {
  return getOpenDotaKey().length > 0
}

export function setOpenDotaKey(value: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    const key = value.trim()
    if (key) localStorage.setItem(API_KEY_STORAGE, key)
    else localStorage.removeItem(API_KEY_STORAGE)
  } catch {
    // Settings are best-effort in privacy modes.
  }
}
