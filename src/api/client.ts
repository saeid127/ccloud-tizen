// CCloud HTTP Client with automatic helper-server failover.
// Replicates com.pira.ccloud.data.repository.BaseRepository from CCloud Android app.

import { API_BASE, HELPER_SERVERS } from './config'
import { log } from '../lib/log'

export type ApiErrorKind = 'network' | 'http' | 'parse' | 'empty'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly url?: string

  constructor(kind: ApiErrorKind, message: string, status?: number, url?: string) {
    super(message)
    this.kind = kind
    this.status = status
    this.url = url
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Generic executeRequest matching CCloud BaseRepository.executeRequest
export async function executeRequest<T>(
  primaryUrl: string,
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 1
  const timeoutMs = opts.timeoutMs ?? 25000

  // 1. First, try primary server (with retries if network glitch)
  let primaryException: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await fetchWithTimeout<T>(primaryUrl, timeoutMs)
      log('ccloud_api', true, primaryUrl)
      return data
    } catch (err) {
      primaryException = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        await sleep(1000 * (attempt + 1))
      }
    }
  }

  log('ccloud_primary_failed', false, `${primaryUrl}: ${primaryException?.message}`)

  // 2. If primary server fails, try helper servers (hostinnegar.com, windowsdiba.info)
  for (let i = 0; i < HELPER_SERVERS.length; i++) {
    const helperServer = HELPER_SERVERS[i]
    try {
      let helperUrl: string
      if (primaryUrl.startsWith('/ccloud-api')) {
        helperUrl = primaryUrl.replace('/ccloud-api', `/ccloud-helper-${i + 1}`)
      } else {
        helperUrl = primaryUrl.replace(/^https?:\/\/[^/]+/i, helperServer)
      }
      log('ccloud_fallback_try', true, helperUrl)
      const data = await fetchWithTimeout<T>(helperUrl, timeoutMs)
      log('ccloud_fallback_success', true, helperUrl)
      return data
    } catch (helperErr) {
      log('ccloud_fallback_fail', false, `${helperServer}: ${helperErr instanceof Error ? helperErr.message : helperErr}`)
      continue
    }
  }

  // 3. If all servers fail, throw the original exception
  throw (
    primaryException ??
    new ApiError('network', 'اتصال به سرورهای CCloud برقرار نشد', undefined, primaryUrl)
  )
}

async function fetchWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new ApiError('http', `سرور با خطای ${res.status} پاسخ داد`, res.status, url)
    }

    const text = await res.text()
    if (!text || !text.trim()) {
      throw new ApiError('empty', 'پاسخ سرور خالی بود', res.status, url)
    }

    try {
      return JSON.parse(text) as T
    } catch (jsonErr) {
      throw new ApiError('parse', `خطا در پردازش اطلاعات دریافتی: ${(jsonErr as Error).message}`, res.status, url)
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    if ((err as Error).name === 'AbortError') {
      throw new ApiError('network', 'مهلت زمانی درخواست به پایان رسید (تایم‌اوت)', undefined, url)
    }
    throw new ApiError('network', (err as Error).message || 'خطای شبکه', undefined, url)
  } finally {
    clearTimeout(timer)
  }
}

// Session helper for backwards compatibility and local state
const TOKEN_KEY = 'ccloud.token'
export const session = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY) ?? 'ccloud-session',
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export function buildEndpointUrl(path: string): string {
  const base = API_BASE.replace(/\/+$/, '')
  const cleanPath = path.replace(/^\/+/, '')
  return `${base}/${cleanPath}`
}
