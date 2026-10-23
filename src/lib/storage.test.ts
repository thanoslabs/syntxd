import { describe, expect, it } from 'vitest'
import { EMPTY_DASHBOARD, exampleDashboard } from './dashboard'
import { STORAGE_KEYS, clearSession, loadSession, saveSession } from './storage'
import type { KeyValueStore, Session } from './storage'

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>()
  limit: number
  constructor(limit = Infinity) {
    this.limit = limit
  }
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (value.length > this.limit) throw new DOMException('full', 'QuotaExceededError')
    this.data.set(key, value)
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
}

const defaults: Session = { raw: '{"sample":true}', dashboard: EMPTY_DASHBOARD, view: 'explore' }
const session: Session = { raw: '{"a":1}', dashboard: exampleDashboard(), view: 'dashboard' }

describe('session cache', () => {
  it('round-trips a session', () => {
    const store = new MemoryStore()
    expect(saveSession(store, session, defaults)).toBe('saved')
    expect(loadSession(store)).toEqual(session)
  })

  it('stores nothing for default values', () => {
    const store = new MemoryStore()
    saveSession(store, session, defaults)
    saveSession(store, defaults, defaults)
    expect(store.data.size).toBe(0)
    expect(loadSession(store)).toEqual({})
  })

  it('keeps the dashboard and drops stale input when the input exceeds the quota', () => {
    const store = new MemoryStore(5000)
    saveSession(store, session, defaults)
    const big = { ...session, raw: 'x'.repeat(6000) }
    expect(saveSession(store, big, defaults)).toBe('input-too-large')
    expect(loadSession(store)).toEqual({ dashboard: session.dashboard, view: 'dashboard' })
  })

  it('reports other write failures', () => {
    const store = new MemoryStore()
    store.setItem = () => {
      throw new Error('blocked')
    }
    expect(saveSession(store, session, defaults)).toBe('failed')
  })

  it('ignores corrupt or unknown saved values', () => {
    const store = new MemoryStore()
    store.setItem(STORAGE_KEYS.dashboard, '{not json')
    store.setItem(STORAGE_KEYS.view, 'sideways')
    store.setItem(STORAGE_KEYS.input, '')
    expect(loadSession(store)).toEqual({ raw: '' })
  })

  it('clears every key', () => {
    const store = new MemoryStore()
    saveSession(store, session, defaults)
    store.setItem('other-app', 'keep')
    clearSession(store)
    expect([...store.data.keys()]).toEqual(['other-app'])
  })
})
