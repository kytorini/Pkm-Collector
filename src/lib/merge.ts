import type { CollectionMap, CollectionEntry } from '../types'

/**
 * Merges two copies of a collection entry by entry, newest edit winning.
 *
 * Syncing whole documents would mean the last device to save silently discards
 * whatever the other did. Every entry already carries `updatedAt`, so edits to
 * different cards on different devices can both survive; only edits to the very
 * same card need a winner.
 */
export interface MergeResult {
  merged: CollectionMap
  /** Entries taken from the remote copy because they were newer. */
  pulled: number
  /** Entries the local copy wins, which the remote still needs. */
  pushed: number
  /** Same card edited on both sides — the newer edit was kept. */
  conflicts: number
}

const stamp = (entry: CollectionEntry): number => {
  const time = Date.parse(entry.updatedAt)
  return Number.isFinite(time) ? time : 0
}

export function mergeCollections(local: CollectionMap, remote: CollectionMap): MergeResult {
  const merged: CollectionMap = {}
  let pulled = 0
  let pushed = 0
  let conflicts = 0

  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const mine = local[key]
    const theirs = remote[key]

    if (mine && !theirs) {
      merged[key] = mine
      pushed++
    } else if (!mine && theirs) {
      merged[key] = theirs
      pulled++
    } else if (mine && theirs) {
      const mineAt = stamp(mine)
      const theirsAt = stamp(theirs)
      if (theirsAt > mineAt) {
        merged[key] = theirs
        pulled++
        conflicts++
      } else if (mineAt > theirsAt) {
        merged[key] = mine
        pushed++
        conflicts++
      } else {
        // Identical timestamps: same edit echoed back, or a clock that didn't
        // move. Keeping the local copy avoids a pointless write either way.
        merged[key] = mine
      }
    }
  }

  return { merged, pulled, pushed, conflicts }
}

/**
 * A deletion is the absence of a key, which a merge can't tell from "the other
 * device hasn't seen it yet" — so a card cleared on one device would come back
 * from the other. Tracking when this device last synced lets a missing remote
 * key be read as a deletion only when the remote copy is demonstrably newer.
 */
export function applyDeletions(
  merged: CollectionMap,
  remote: CollectionMap,
  remoteSavedAt: number,
  lastSyncedAt: number,
): CollectionMap {
  if (!remoteSavedAt || !lastSyncedAt || remoteSavedAt <= lastSyncedAt) return merged

  const next: CollectionMap = {}
  for (const [key, entry] of Object.entries(merged)) {
    const missingRemotely = !(key in remote)
    // Only drop entries this device hasn't touched since its last sync;
    // anything edited locally since then is a real local change.
    const untouchedLocally = stamp(entry) <= lastSyncedAt
    if (missingRemotely && untouchedLocally) continue
    next[key] = entry
  }
  return next
}
