import type { PriceRules } from './priceRules'
import type { CollectionMap } from '../types'

/**
 * Sync over Supabase's REST API. Supabase is used as a plain key/value row
 * rather than anything clever: one row per sync code, holding the whole
 * collection. Merging is the app's job (see merge.ts), so the transport only
 * has to read and write a document.
 */

const SETTINGS_KEY = 'pkm-collector:sync'

export interface SyncSettings {
  url: string
  anonKey: string
  /** Shared secret and row id. Both devices use the same code. */
  syncCode: string
  enabled: boolean
}

export interface RemoteDocument {
  collection: CollectionMap
  savedAt: number
}

export interface RemoteRules {
  rules: PriceRules
  savedAt: number
}

/**
 * Price rules live in their own row rather than beside the collection.
 *
 * The collection row's `data` is the card map itself, and an older build of
 * the app reads it as exactly that — wrapping it to make room here would have
 * a device still running yesterday's code read two settings objects as two
 * cards, and then push that back. A second row under a suffixed id is
 * invisible to those builds, needs no change to the table, and can't corrupt
 * anything if only one device has updated yet.
 */
const rulesId = (s: SyncSettings) => `${s.syncCode.trim()}:priceRules`

export const EMPTY_SETTINGS: SyncSettings = { url: '', anonKey: '', syncCode: '', enabled: false }

export function loadSyncSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...EMPTY_SETTINGS, ...(JSON.parse(raw) as Partial<SyncSettings>) } : { ...EMPTY_SETTINGS }
  } catch {
    return { ...EMPTY_SETTINGS }
  }
}

export function saveSyncSettings(settings: SyncSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

/** Long enough that it can't be guessed, short enough to retype onto a phone. */
export function generateSyncCode(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length])
  // Grouped for legibility when typing it across from another screen.
  return [chars.slice(0, 5), chars.slice(5, 10), chars.slice(10, 15), chars.slice(15, 20)]
    .map((group) => group.join(''))
    .join('-')
}

export function isConfigured(s: SyncSettings): boolean {
  return Boolean(s.url.trim() && s.anonKey.trim() && s.syncCode.trim())
}

function endpoint(s: SyncSettings): string {
  return `${s.url.trim().replace(/\/+$/, '')}/rest/v1/collections`
}

function headers(s: SyncSettings): HeadersInit {
  const key = s.anonKey.trim()
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

const TIMEOUT_MS = 20_000

async function request(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('Sync timed out. Check the URL, or try again.')
    }
    throw new Error('Could not reach the sync server. Check the URL and your connection.')
  }
}

function describe(status: number): string {
  if (status === 401 || status === 403) return 'Sync rejected the key (401/403). Check the anon key and the table policy.'
  if (status === 404) return "Sync couldn't find the table (404). Check the project URL and that the `collections` table exists."
  return `Sync server returned ${status}.`
}

/** Reads the shared document. A code that has never synced returns null. */
export async function pullRemote(s: SyncSettings): Promise<RemoteDocument | null> {
  const url = `${endpoint(s)}?id=eq.${encodeURIComponent(s.syncCode.trim())}&select=data,updated_at`
  const res = await request(url, { headers: headers(s) })
  if (!res.ok) throw new Error(describe(res.status))

  const rows = (await res.json()) as { data?: CollectionMap; updated_at?: string }[]
  if (!Array.isArray(rows) || rows.length === 0) return null

  const row = rows[0]
  const savedAt = row.updated_at ? Date.parse(row.updated_at) : 0
  return {
    collection: row.data && typeof row.data === 'object' ? row.data : {},
    savedAt: Number.isFinite(savedAt) ? savedAt : 0,
  }
}

/** The other device's price sources, or null if it has never set any. */
export async function pullRules(s: SyncSettings): Promise<RemoteRules | null> {
  const url = `${endpoint(s)}?id=eq.${encodeURIComponent(rulesId(s))}&select=data,updated_at`
  const res = await request(url, { headers: headers(s) })
  if (!res.ok) throw new Error(describe(res.status))

  const rows = (await res.json()) as { data?: PriceRules; updated_at?: string }[]
  if (!Array.isArray(rows) || rows.length === 0) return null
  const row = rows[0]
  if (!row.data || typeof row.data !== 'object') return null

  // The age of the rules themselves, not of the row they sit in. A device that
  // re-pushes unchanged rules moves the row's write time without making its
  // copy any newer — judged by that, it would then look newer than a change
  // another device had just made, and overwrite it.
  const contentAt = row.data.updatedAt ? Date.parse(row.data.updatedAt) : NaN
  const rowAt = row.updated_at ? Date.parse(row.updated_at) : NaN
  const savedAt = Number.isFinite(contentAt) ? contentAt : Number.isFinite(rowAt) ? rowAt : 0
  return { rules: row.data, savedAt }
}

export async function pushRules(s: SyncSettings, rules: PriceRules): Promise<void> {
  const body = JSON.stringify([
    { id: rulesId(s), data: rules, updated_at: new Date().toISOString() },
  ])
  const res = await request(endpoint(s), {
    method: 'POST',
    headers: { ...headers(s), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body,
  })
  if (!res.ok) throw new Error(describe(res.status))
}

/** Writes the merged document back, creating the row on first use. */
export async function pushRemote(s: SyncSettings, collection: CollectionMap): Promise<void> {
  const body = JSON.stringify([
    { id: s.syncCode.trim(), data: collection, updated_at: new Date().toISOString() },
  ])
  const res = await request(endpoint(s), {
    method: 'POST',
    headers: { ...headers(s), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body,
  })
  if (!res.ok) throw new Error(describe(res.status))
}
