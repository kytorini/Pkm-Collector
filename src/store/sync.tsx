import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { applyDeletions, mergeCollections } from '../lib/merge'
import {
  EMPTY_SETTINGS,
  isConfigured,
  loadSyncSettings,
  pullRemote,
  pushRemote,
  saveSyncSettings,
  type SyncSettings,
} from '../lib/sync'
import { useCollection } from './collection'

const LAST_SYNCED_KEY = 'pkm-collector:lastSyncedAt'

export type SyncState = 'idle' | 'syncing' | 'ok' | 'error'

export interface SyncResult {
  pulled: number
  pushed: number
  conflicts: number
  /** Cards in the collection after the sync — the number that reassures. */
  total: number
  removed: number
  heldBack: number
}

interface SyncContextValue {
  settings: SyncSettings
  update: (patch: Partial<SyncSettings>) => void
  state: SyncState
  error: string | null
  lastSyncedAt: number
  lastResult: SyncResult | null
  syncNow: () => Promise<void>
  configured: boolean
}

const SyncContext = createContext<SyncContextValue | null>(null)

/** Long enough that typing doesn't trigger a write per keystroke. */
const AUTOSYNC_DEBOUNCE_MS = 4000

export function SyncProvider({ children }: { children: ReactNode }) {
  const { collection, replaceAll } = useCollection()
  const [settings, setSettings] = useState<SyncSettings>(loadSyncSettings)
  const [state, setState] = useState<SyncState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState(() => Number(localStorage.getItem(LAST_SYNCED_KEY) ?? 0))

  // The latest collection, for callbacks that must not re-run on every edit.
  const collectionRef = useRef(collection)
  collectionRef.current = collection
  const running = useRef(false)

  const update = useCallback((patch: Partial<SyncSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSyncSettings(next)
      return next
    })
    setError(null)
  }, [])

  const configured = isConfigured(settings)

  const syncNow = useCallback(async () => {
    if (!isConfigured(settings) || running.current) return
    running.current = true
    setState('syncing')
    setError(null)
    try {
      const remote = await pullRemote(settings)
      const local = collectionRef.current

      if (!remote) {
        // First device on this code: seed it rather than merging with nothing.
        await pushRemote(settings, local)
        const total = Object.keys(local).length
        setLastResult({ pulled: 0, pushed: total, conflicts: 0, total, removed: 0, heldBack: 0 })
      } else {
        const result = mergeCollections(local, remote.collection)
        const deletions = applyDeletions(result.merged, remote.collection, remote.savedAt, lastSyncedAt)
        const merged = deletions.collection
        replaceAll(merged)
        collectionRef.current = merged
        // Only write back when this device actually has something to add.
        if (result.pushed > 0 || Object.keys(merged).length !== Object.keys(remote.collection).length) {
          await pushRemote(settings, merged)
        }
        setLastResult({
          pulled: result.pulled,
          pushed: result.pushed,
          conflicts: result.conflicts,
          total: Object.keys(merged).length,
          removed: deletions.removed,
          heldBack: deletions.heldBack,
        })
      }

      const now = Date.now()
      setLastSyncedAt(now)
      localStorage.setItem(LAST_SYNCED_KEY, String(now))
      setState('ok')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.')
      setState('error')
    } finally {
      running.current = false
    }
  }, [settings, lastSyncedAt, replaceAll])

  // Sync when the app opens or comes back to the foreground, which is when the
  // other device's changes are most likely to be waiting.
  useEffect(() => {
    if (!settings.enabled || !configured) return
    void syncNow()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
    // syncNow is deliberately excluded: it changes with every sync, and this
    // effect only needs to (re)arm when sync is switched on or reconfigured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled, configured, settings.url, settings.syncCode])

  // And shortly after edits settle, so a change made here reaches the other
  // device without waiting for an app switch.
  const firstRun = useRef(true)
  useEffect(() => {
    if (!settings.enabled || !configured) return
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const timer = setTimeout(() => void syncNow(), AUTOSYNC_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, settings.enabled, configured])

  const value = useMemo(
    () => ({ settings, update, state, error, lastSyncedAt, lastResult, syncNow, configured }),
    [settings, update, state, error, lastSyncedAt, lastResult, syncNow, configured],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>')
  return ctx
}

export { EMPTY_SETTINGS }
