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
export interface DeletionResult {
  collection: CollectionMap
  /** Entries removed because the other device deleted them. */
  removed: number
  /**
   * Removals refused as too large to be real. A device that syncs while empty
   * — a cleared browser, a fresh profile, a failed restore — would otherwise
   * push an empty document and wipe every other device's collection.
   */
  heldBack: number
}

/** Below this many entries, proportion is meaningless, so allow small deletes. */
const ALWAYS_ALLOW_BELOW = 10
/** Above this share of the collection, a deletion looks like an accident. */
const MAX_DELETE_SHARE = 0.25

export function applyDeletions(
  merged: CollectionMap,
  remote: CollectionMap,
  remoteSavedAt: number,
  lastSyncedAt: number,
): DeletionResult {
  if (!remoteSavedAt || !lastSyncedAt || remoteSavedAt <= lastSyncedAt) {
    return { collection: merged, removed: 0, heldBack: 0 }
  }

  const deletable = Object.entries(merged).filter(
    ([key, entry]) =>
      !(key in remote) &&
      // Only entries untouched here since the last sync; anything edited
      // locally since then is a real local change, not a remote deletion.
      stamp(entry) <= lastSyncedAt,
  )
  if (deletable.length === 0) return { collection: merged, removed: 0, heldBack: 0 }

  const total = Object.keys(merged).length
  const wholesale = deletable.length > ALWAYS_ALLOW_BELOW && deletable.length > total * MAX_DELETE_SHARE
  if (wholesale) return { collection: merged, removed: 0, heldBack: deletable.length }

  const doomed = new Set(deletable.map(([key]) => key))
  const next: CollectionMap = {}
  for (const [key, entry] of Object.entries(merged)) if (!doomed.has(key)) next[key] = entry
  return { collection: next, removed: doomed.size, heldBack: 0 }
}
