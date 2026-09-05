/**
 * Browser storage can be evicted when a device runs low on space, which for
 * this app would mean losing a collection that took hours to enter. Asking for
 * persistent storage opts out of that eviction where the browser supports it.
 */
export type PersistState = 'persisted' | 'not-persisted' | 'unsupported'

export async function requestPersistentStorage(): Promise<PersistState> {
  if (!navigator.storage?.persist) return 'unsupported'
  try {
    // Already granted on a previous visit — asking again would be a no-op.
    if (await navigator.storage.persisted?.()) return 'persisted'
    return (await navigator.storage.persist()) ? 'persisted' : 'not-persisted'
  } catch {
    return 'unsupported'
  }
}

export async function getPersistState(): Promise<PersistState> {
  if (!navigator.storage?.persisted) return 'unsupported'
  try {
    return (await navigator.storage.persisted()) ? 'persisted' : 'not-persisted'
  } catch {
    return 'unsupported'
  }
}

export interface StorageUse {
  usedBytes: number
  quotaBytes: number
}

export async function getStorageUse(): Promise<StorageUse | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return { usedBytes: usage ?? 0, quotaBytes: quota ?? 0 }
  } catch {
    return null
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
