// CCloud API configuration.
// Follows CCloud Android app data architecture (BaseRepository / MovieRepository / SeriesRepository).
// Credentials & keys: can be configured via .env.local (git-ignored) or runtime config.json.

export let API_BASE: string =
  import.meta.env.VITE_CCLOUD_API_BASE ??
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? '/ccloud-api' : 'https://server-hi-speed-iran.info/api')

// Fallback key from CCloud Android app (BaseRepository.API_KEY).
// Can be overridden via VITE_CCLOUD_API_KEY / VITE_API_KEY in .env.local or apiKey in config.json.
export let API_KEY: string =
  import.meta.env.VITE_CCLOUD_API_KEY ??
  import.meta.env.VITE_API_KEY ??
  '4F5A9C3D9A86FA54EACEDDD635185'

// Fallback helper servers from CCloud Android BaseRepository.helperServers
export let HELPER_SERVERS: string[] = [
  'https://hostinnegar.com',
  'https://windowsdiba.info',
]

export const QR_POLL_MS = 5000
export const QR_TTL_MS = 60 * 1000
export const OBSERVER_EVERY_S = 15

export interface RuntimeConfig {
  apiBase?: string
  apiKey?: string
  helperServers?: string[]
}

export async function loadRuntimeConfig(): Promise<void> {
  try {
    const raw = await readPackageFile('./config.json')
    const cfg = JSON.parse(raw) as RuntimeConfig
    if (cfg.apiBase?.trim()) API_BASE = cfg.apiBase.trim().replace(/\/+$/, '')
    if (cfg.apiKey?.trim()) API_KEY = cfg.apiKey.trim()
    if (Array.isArray(cfg.helperServers) && cfg.helperServers.length > 0) {
      HELPER_SERVERS = cfg.helperServers.map((s) => s.trim().replace(/\/+$/, ''))
    }
  } catch {
    // No config.json present; use environment variables or defaults
  }
}

// XHR, not fetch: on Tizen TV the app runs from file:// inside .wgt, which Chromium's fetch refuses.
function readPackageFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', path)
    xhr.onload = () =>
      xhr.status === 200 || (xhr.status === 0 && xhr.responseText)
        ? resolve(xhr.responseText)
        : reject(new Error(`${xhr.status}`))
    xhr.onerror = () => reject(new Error('unreadable'))
    xhr.send()
  })
}
