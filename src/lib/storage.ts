import { parseDashboard, serializeDashboard } from './dashboard'
import type { Dashboard } from './dashboard'

/**
 * Local, per-browser session cache. Everything stays in the browser's
 * localStorage; nothing is sent anywhere. Each piece is stored under its own
 * key so a too-large input can't stop the dashboard from being saved.
 */

export type SavedView = 'explore' | 'dashboard'

export interface Session {
  raw: string
  dashboard: Dashboard
  view: SavedView
}

/** The subset of the Web Storage API we use, so tests can pass an in-memory fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const STORAGE_KEYS = {
  input: 'syntxd:v1:input',
  dashboard: 'syntxd:v1:dashboard',
  view: 'syntxd:v1:view',
} as const

export type SaveStatus = 'saved' | 'input-too-large' | 'failed'

/** localStorage, or `null` when it is missing or blocked (private mode, disabled site data). */
export function getBrowserStore(): KeyValueStore | null {
  try {
    const store = globalThis.localStorage
    if (!store) return null
    const probe = 'syntxd:probe'
    store.setItem(probe, '1')
    store.removeItem(probe)
    return store
  } catch {
    return null
  }
}

function read(store: KeyValueStore, key: string): string | null {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

/** Restore whatever was saved; unreadable or invalid pieces are skipped. */
export function loadSession(store: KeyValueStore): Partial<Session> {
  const session: Partial<Session> = {}

  const raw = read(store, STORAGE_KEYS.input)
  if (raw !== null) session.raw = raw

  const dashboardText = read(store, STORAGE_KEYS.dashboard)
  if (dashboardText !== null) {
    const parsed = parseDashboard(dashboardText)
    if (parsed.ok) session.dashboard = parsed.dashboard
  }

  const view = read(store, STORAGE_KEYS.view)
  if (view === 'explore' || view === 'dashboard') session.view = view

  return session
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
}

/**
 * Persist the session. Values equal to `defaults` are removed rather than
 * written, so a freshly cleared app leaves storage empty.
 */
export function saveSession(store: KeyValueStore, session: Session, defaults: Session): SaveStatus {
  const dashboardText = serializeDashboard(session.dashboard)
  // The input goes last so a quota error on it can't block the smaller pieces.
  const entries: Array<[key: string, value: string, isDefault: boolean]> = [
    [STORAGE_KEYS.dashboard, dashboardText, dashboardText === serializeDashboard(defaults.dashboard)],
    [STORAGE_KEYS.view, session.view, session.view === defaults.view],
    [STORAGE_KEYS.input, session.raw, session.raw === defaults.raw],
  ]

  let status: SaveStatus = 'saved'
  for (const [key, value, isDefault] of entries) {
    try {
      if (isDefault) store.removeItem(key)
      else store.setItem(key, value)
    } catch (err) {
      if (key === STORAGE_KEYS.input && isQuotaError(err)) {
        // Don't leave an older input behind to be restored in place of this one.
        try {
          store.removeItem(key)
        } catch {
          // ignore
        }
        status = 'input-too-large'
      } else {
        return 'failed'
      }
    }
  }
  return status
}

export function clearSession(store: KeyValueStore): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    try {
      store.removeItem(key)
    } catch {
      // ignore
    }
  }
}
