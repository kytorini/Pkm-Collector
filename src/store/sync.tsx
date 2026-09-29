import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { applyDeletions, mergeCollections } from '../lib/merge'
import {
  EMPTY_SETTINGS,
  isConfigured,
  loadSyncSettings,
  pullRemote,
  pullRules,
  pullSets,
  pushRemote,
  pushRules,
  pushSets,
  saveSyncSettings,
  type SyncSettings,
} from '../lib/sync'
import { adoptPriceRules, loadPriceRules, markRulesSynced, rulesChangedAt, rulesNeedPush } from '../lib/priceRules'
import { loadTrackedSetsDoc, mergeTrackedSets, replaceTrackedSets } from '../lib/trackedSets'
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

      // The figures ride on the collection, but the rule saying to read them
      // does not — and a price nothing reads is a blank screen on the other
      // device. Whole-object, newest wins.
      await syncPriceRules(settings)
      await syncTrackedSets(settings)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

/**
 * Price sources, settled separately from the collection: they are one small
 * object rather than a map of independently edited entries, so the newer copy
 * simply wins.
 */
/**
 * Which sets you collect, settled per set rather than per device.
 *
 * Both sides get merged and both sides get written: sets are added from
 * whichever device is to hand, so a straight "newer wins" would throw away
 * whatever the other one had added since.
 */
async function syncTrackedSets(settings: SyncSettings): Promise<void> {
  const mine = loadTrackedSetsDoc()
  const remote = await pullSets(settings)

  if (!remote) {
    if (mine.sets.length > 0) await pushSets(settings, mine, new Date().toISOString())
    return
  }

  const merged = mergeTrackedSets(mine, remote.doc)
  replaceTrackedSets(merged)

  const changed =
    merged.sets.length !== remote.doc.sets.length ||
    merged.sets.some((set) => {
      const theirs = remote.doc.sets.find((t) => t.id === set.id)
      return !theirs || theirs.updatedAt !== set.updatedAt
    })
  // Only write when the remote copy is actually behind: an unconditional push
  // would touch the row on every sync and make this device look newest.
  if (changed) await pushSets(settings, merged, new Date().toISOString())
}

async function syncPriceRules(settings: SyncSettings): Promise<void> {
  // Taken before the request, and pushed as taken. Reading them again
  // afterwards meant a sync that adopted the other device's rules while this
  // one was in flight would then push those same rules straight back, and the
  // change made here would vanish.
  const mine = loadPriceRules()
  const mineAt = rulesChangedAt()
  const unsent = rulesNeedPush()

  const remote = await pullRules(settings)

  const send = async () => {
    await pushRules(settings, mine)
    markRulesSynced()
  }

  if (!remote) {
    if (unsent) await send()
    return
  }
  if (remote.savedAt > mineAt) {
    adoptPriceRules(remote.rules)
    return
  }
  // Only this device's own unsent change is worth writing. Re-sending rules
  // that merely arrived from the other device is how one overwrites the other.
  if (unsent) await send()
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>')
  return ctx
}

export { EMPTY_SETTINGS }
