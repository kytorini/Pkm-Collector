import { useSyncExternalStore } from 'react'
import { VINTAGE_SETS } from '../data/vintageSets'
import { getPreset } from '../data/variantPresets'
import type { ManualCard } from './manualSet'
import { isRegion, scopedId, type RegionId, type SourceId } from './regions'
import type { SetVariant, VintageSet } from '../types'

/**
 * The sets you collect.
 *
 * This used to be a list of sixteen written into the app, every one of them
 * downloaded on first run whether you chased it or not. It is yours now: add
 * the sets you want, in the regions you want, and only those are fetched and
 * kept. Removing one throws its cards away and leaves your collection
 * entries alone, so adding it back finds them again.
 *
 * Held here rather than in a view so two mounted pages can't disagree, and
 * written through a listener so a second tab follows along.
 */
const STORAGE_KEY = 'pkm-collector:trackedSets'
/** Set once the vintage list has been turned into tracked sets, so it is not redone. */
const MIGRATED_KEY = 'pkm-collector:trackedSets:migrated'

export interface TrackedSet extends VintageSet {
  /** The id its source knows it by, which is what gets fetched. */
  sourceId: string
  source: SourceId
  region: RegionId
  /** Which preset its runs came from, so the choice can be shown and changed. */
  preset: string
  /**
   * True once the split was chosen by hand. Nothing re-reads it off the cards
   * after that: the feed is usually right, but the collector is the one who
   * knows whether they separate a printing, and being overruled by a
   * background job is how an app loses trust.
   */
  pinned?: boolean
  /**
   * The checklist of a hand-built set, kept here rather than in the card
   * cache so it travels with the set list over sync. There is nowhere for
   * another device to download these from, so it has to carry them.
   */
  manualCards?: ManualCard[]
  /**
   * Whether you mean to finish it.
   *
   * Adding a set used to say "I intend to collect all of this", which is not
   * what a Van Gogh Pikachu means, nor one Charizard out of a set of 191.
   * A set you aren't chasing still counts towards what your collection is
   * worth and what you spent — you own the cards — but not towards
   * completion or remaining cost, which are about finishing something.
   *
   * Absent means chasing, so every set tracked before this keeps counting the
   * way it did.
   */
  chasing?: boolean
  /**
   * Where you put it, if you have moved it.
   *
   * Release order is a good default and a poor permanent answer: what you are
   * working on belongs at the top, and the app has no way to know which set
   * that is. Absent means "wherever the year says", so a list nobody has
   * rearranged behaves exactly as it always did.
   *
   * Carried on the set rather than as a list of ids elsewhere, so it survives
   * the sync merge — which rebuilds the list from whichever copy of each set
   * was touched last and would lose an ordering held anywhere else.
   */
  rank?: number
  /** ISO. Ordering falls back to this when a set has no release date. */
  addedAt: string
  /** Last write, for settling two devices that both changed the list. */
  updatedAt: string
}

const isSet = (value: unknown): value is TrackedSet => {
  const s = value as TrackedSet
  return (
    Boolean(s) &&
    typeof s.id === 'string' &&
    typeof s.sourceId === 'string' &&
    typeof s.name === 'string' &&
    isRegion(s.region as string) &&
    Array.isArray(s.variants) &&
    s.variants.length > 0
  )
}

/**
 * What is on disk: the sets, and when each removed one was removed.
 *
 * The tombstones are what make two devices agree. Without them a set dropped
 * on the phone simply reappears from the iPad's copy on the next sync, over
 * and over, because absence carries no date and so never wins an argument.
 */
export interface TrackedSetsDoc {
  sets: TrackedSet[]
  removed: Record<string, string>
}

function readDoc(): TrackedSetsDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) return { sets: parsed.filter(isSet), removed: {} }
    const doc = parsed as TrackedSetsDoc | null
    if (!doc || !Array.isArray(doc.sets)) return { sets: [], removed: {} }
    return {
      sets: doc.sets.filter(isSet),
      removed: doc.removed && typeof doc.removed === 'object' ? doc.removed : {},
    }
  } catch {
    return { sets: [], removed: {} }
  }
}

function read(): TrackedSet[] {
  return readDoc().sets
}

/**
 * Turns the sixteen built-in sets into tracked ones, once, for a collection
 * that predates this. Sets that were hidden are left out: hiding one said
 * "not chasing it", which is what removing one says now, and its cards and
 * entries are still on disk if it comes back.
 */
function migrate(): TrackedSet[] {
  let hidden: string[] = []
  try {
    const raw = localStorage.getItem('pkm-collector:hiddenSets')
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) hidden = parsed.filter((h): h is string => typeof h === 'string')
  } catch {
    /* an unreadable hidden list just means nothing was hidden */
  }
  const now = new Date().toISOString()
  return VINTAGE_SETS.filter((s) => !hidden.includes(s.id)).map((s) => ({
    ...s,
    sourceId: s.id,
    source: 'pokemontcg' as const,
    region: 'en' as RegionId,
    preset: 'custom',
    addedAt: now,
    updatedAt: now,
  }))
}

/**
 * Has this app been used on this device before?
 *
 * Any of its own keys will do — a collection, a hidden set, a sync code, a
 * chosen density. The distinction matters: a collection that predates
 * choosable sets has to carry over onto the sixteen it was built on, while a
 * fresh install must start with nothing, which is the whole point of not
 * preloading sets.
 */
function usedBefore(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('pkm-collector:')) continue
      if (key === STORAGE_KEY || key === MIGRATED_KEY) continue
      return true
    }
    return false
  } catch {
    return false
  }
}

function boot(): TrackedSet[] {
  const stored = read()
  if (stored.length > 0) return stored
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return stored
    localStorage.setItem(MIGRATED_KEY, '1')
  } catch {
    return stored
  }
  if (!usedBefore()) return stored
  const migrated = migrate()
  if (migrated.length > 0) write(migrated)
  return migrated
}

let tracked: TrackedSet[] = []
let removed: Record<string, string> = {}
const listeners = new Set<() => void>()
const emit = () => {
  for (const listener of listeners) listener()
}

function write(next: TrackedSet[], graves = removed): void {
  tracked = next
  removed = graves
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sets: next, removed: graves } satisfies TrackedSetsDoc))
  } catch {
    /* out of room: the list stays live for this session */
  }
  emit()
}

removed = readDoc().removed
tracked = boot()

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    const doc = readDoc()
    tracked = doc.sets
    removed = doc.removed
    emit()
  })
}

export function loadTrackedSetsDoc(): TrackedSetsDoc {
  return { sets: tracked, removed }
}

/** The most recent change of any kind, for deciding which device is behind. */
export function trackedSetsChangedAt(): number {
  const stamps = [...tracked.map((s) => s.updatedAt), ...Object.values(removed)]
  return stamps.reduce((newest, at) => Math.max(newest, Date.parse(at) || 0), 0)
}

export function loadTrackedSets(): TrackedSet[] {
  return tracked
}

export function isTracked(id: string): boolean {
  return tracked.some((s) => s.id === id)
}

export interface NewSet {
  sourceId: string
  region: RegionId
  name: string
  series: string
  year: number
  total: number
  preset: string
  /** Given only for a set typed in here; it decides the source. */
  manualCards?: ManualCard[]
  /** False for a set you keep singles from rather than mean to finish. */
  chasing?: boolean
}

/** Unranked sets sort after ranked ones, rather than sharing position 0. */
const rankOf = (set: TrackedSet): number =>
  typeof set.rank === 'number' ? set.rank : Number.MAX_SAFE_INTEGER

/** Where you put them, or oldest print first for the sets you never moved. */
function inOrder(list: TrackedSet[]): TrackedSet[] {
  return [...list].sort(
    (a, b) => rankOf(a) - rankOf(b) || a.year - b.year || a.name.localeCompare(b.name),
  )
}

/** True once anything has been moved by hand, which changes where a new set lands. */
function isRanked(list: TrackedSet[]): boolean {
  return list.some((s) => typeof s.rank === 'number')
}

export function addSet(set: NewSet, variants?: SetVariant[]): TrackedSet {
  // Adding back something removed clears its grave, or the next sync would
  // bury it again.
  const id = scopedId(set.region, set.sourceId)
  const now = new Date().toISOString()
  const existing = tracked.find((s) => s.id === id)
  const next: TrackedSet = {
    id,
    sourceId: set.sourceId,
    source: set.manualCards ? 'manual' : set.region === 'en' ? 'pokemontcg' : 'tcgdex',
    region: set.region,
    name: set.name,
    series: set.series,
    year: set.year,
    total: set.total,
    preset: set.preset,
    ...(set.manualCards ? { manualCards: set.manualCards } : {}),
    ...(set.chasing === false ? { chasing: false } : {}),
    variants: variants ?? getPreset(set.preset).variants,
    /*
     * A set added to a list you have arranged goes on the end, where you can
     * see it and move it. Slotting it in by year would drop it silently into
     * the middle of an order you chose for reasons the year knows nothing
     * about.
     */
    ...(existing?.rank !== undefined
      ? { rank: existing.rank }
      : isRanked(tracked)
        ? { rank: Math.max(...tracked.map(rankOf).filter((r) => r < Number.MAX_SAFE_INTEGER), -1) + 1 }
        : {}),
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
  }
  const graves = { ...removed }
  delete graves[id]
  write(inOrder([...tracked.filter((s) => s.id !== id), next]), graves)
  return next
}

export function removeSet(id: string): void {
  write(tracked.filter((s) => s.id !== id), { ...removed, [id]: new Date().toISOString() })
}

/**
 * Replaces a set's runs with what was read off its cards.
 *
 * Marked `detected` rather than as one of the presets, because it is not a
 * choice from a menu — it is what the set turned out to be, and saying so is
 * how the picker knows not to claim otherwise.
 */
export function setDetectedVariants(id: string, variants: SetVariant[]): void {
  write(
    tracked.map((s) =>
      s.id === id ? { ...s, preset: 'detected', variants, updatedAt: new Date().toISOString() } : s,
    ),
  )
}

/**
 * Sets whose runs were guessed before their cards arrived, and which nobody
 * has since set by hand — the ones worth re-reading off the feed.
 *
 * Deliberately excludes `custom`, the hand-written splits a pre-existing
 * collection was migrated onto. Base Set's three printings are a collector's
 * distinction the price feed does not draw, and re-reading it would quietly
 * merge Shadowless into Unlimited.
 */
const GUESSED = new Set(['single', 'reverse', 'first-unlimited'])

export function needsDetection(set: TrackedSet): boolean {
  return !set.pinned && GUESSED.has(set.preset)
}

/** Changes how a set is split, keeping everything else about it. */
export function setPreset(id: string, preset: string): void {
  write(
    tracked.map((s) =>
      s.id === id
        ? { ...s, preset, pinned: true, variants: getPreset(preset).variants, updatedAt: new Date().toISOString() }
        : s,
    ),
  )
}

/** Switches a set between one you mean to finish and one you keep singles from. */
export function setChasing(id: string, chasing: boolean): void {
  write(
    tracked.map((s) => (s.id === id ? { ...s, chasing, updatedAt: new Date().toISOString() } : s)),
  )
}

/**
 * Moves a set one place up or down.
 *
 * `among` is the ids actually on screen, in the order they appear. A set you
 * aren't chasing, or one filtered out, still sits somewhere in the stored
 * list — swapping with it would look like the button did nothing. The swap is
 * therefore made between neighbours *you can see*, and takes their places in
 * the full list with them.
 *
 * The first move ranks everything, because a list where only one set knows
 * its place has no order at all: the rest would pile up behind it.
 */
export function moveSet(id: string, delta: -1 | 1, among?: string[]): void {
  const order = inOrder(tracked).map((s) => s.id)
  const visible = among ? order.filter((o) => among.includes(o)) : order
  const at = visible.indexOf(id)
  const swapWith = visible[at + delta]
  if (at < 0 || swapWith === undefined) return

  const a = order.indexOf(id)
  const b = order.indexOf(swapWith)
  order[a] = swapWith
  order[b] = id

  const ranks = new Map(order.map((setId, rank) => [setId, rank]))
  const now = new Date().toISOString()
  write(
    inOrder(
      tracked.map((set) => {
        const rank = ranks.get(set.id)
        // Only what actually moved is restamped, so a reorder doesn't win
        // every other argument the next sync has to settle.
        return rank === undefined || rank === set.rank ? set : { ...set, rank, updatedAt: now }
      }),
    ),
  )
}

/** Gives the list back to the release dates. */
export function clearOrder(): void {
  if (!isRanked(tracked)) return
  const now = new Date().toISOString()
  write(
    inOrder(
      tracked.map((set) => {
        if (set.rank === undefined) return set
        const { rank: _dropped, ...rest } = set
        return { ...rest, updatedAt: now }
      }),
    ),
  )
}

/** Whether the list has been arranged by hand, so the way back can be offered. */
export function hasCustomOrder(): boolean {
  return isRanked(tracked)
}

/** The sets counted towards completion and remaining cost. */
export function isChasing(set: TrackedSet): boolean {
  return set.chasing !== false
}

/** Wholesale replacement, for a sync that has settled the two sides. */
export function replaceTrackedSets(doc: TrackedSetsDoc): void {
  write(inOrder(doc.sets.filter(isSet)), doc.removed ?? {})
}

/**
 * Settles two devices' lists.
 *
 * Neither side is simply right: sets get added from whichever device is to
 * hand, so a list that merely overwrote the other would lose whatever was
 * added on the loser. Each set is taken from whichever copy was touched last,
 * and is dropped only when it was removed after that — which is why removals
 * are dated rather than implied by absence.
 */
export function mergeTrackedSets(mine: TrackedSetsDoc, theirs: TrackedSetsDoc): TrackedSetsDoc {
  const at = (iso: string | undefined): number => (iso ? Date.parse(iso) || 0 : 0)

  const removedBoth: Record<string, string> = { ...theirs.removed }
  for (const [id, when] of Object.entries(mine.removed ?? {})) {
    if (at(when) > at(removedBoth[id])) removedBoth[id] = when
  }

  const best = new Map<string, TrackedSet>()
  for (const set of [...theirs.sets, ...mine.sets]) {
    const held = best.get(set.id)
    if (!held || at(set.updatedAt) > at(held.updatedAt)) best.set(set.id, set)
  }

  const sets = [...best.values()].filter((set) => at(removedBoth[set.id]) <= at(set.updatedAt))
  // A set that is back does not need its grave any more, and keeping it would
  // make the document grow without end.
  for (const set of sets) delete removedBoth[set.id]
  return { sets: inOrder(sets), removed: removedBoth }
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useTrackedSets(): TrackedSet[] {
  return useSyncExternalStore(subscribe, loadTrackedSets, loadTrackedSets)
}
