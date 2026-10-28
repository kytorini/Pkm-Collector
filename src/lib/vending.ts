/**
 * Pokémon TCG vending machines, from The Pokémon Company's own locator.
 *
 * The list is fetched by a weekly job rather than by the app: the official
 * locator is built for its own page, not to be called from someone else's,
 * and a browser can't be relied on to reach it. The job writes vending.json
 * beside the app, and every deploy carries the latest copy.
 *
 * "New" needs a date the locator doesn't always give, so the job records the
 * first week it saw each machine. Machines already there on the very first
 * run have no such date — they were simply present when tracking began — and
 * are never marked new; only ones that appear later can be.
 */

export interface VendingMachine {
  id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  lat: number
  lng: number
  /** ISO date the weekly check first saw it. Null for the first run's machines. */
  firstSeen: string | null
  /** ISO date from the locator itself, when it publishes one. */
  installedAt?: string | null
}

export interface VendingData {
  source: string
  /** When the weekly check last ran. Null until it first has. */
  checkedAt: string | null
  /** The first run: machines seen then predate tracking. */
  baselineAt: string | null
  machines: VendingMachine[]
}

const NEW_FOR_MS = 30 * 24 * 60 * 60 * 1000
const STALE_AFTER_MS = 9 * 24 * 60 * 60 * 1000

export async function loadVending(): Promise<VendingData> {
  const res = await fetch(`${import.meta.env.BASE_URL}vending.json`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`The machine list could not be loaded (${res.status}).`)
  return (await res.json()) as VendingData
}

/** Less than a month old, by the locator's own date or else the week it first appeared. */
export function isNew(machine: VendingMachine, now = Date.now()): boolean {
  const since = Date.parse(machine.installedAt ?? machine.firstSeen ?? '')
  return Number.isFinite(since) && now - since < NEW_FOR_MS
}

/** True when the weekly check has missed a run or two. */
export function isStale(data: VendingData, now = Date.now()): boolean {
  const at = Date.parse(data.checkedAt ?? '')
  return !Number.isFinite(at) || now - at > STALE_AFTER_MS
}

/** Miles between two points, as the crow flies. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}

/** Directions in Apple Maps, which opens Google Maps' equivalent on anything else. */
export function directionsUrl(m: VendingMachine): string {
  const q = encodeURIComponent(`${m.name}, ${m.address}, ${m.city}, ${m.state} ${m.zip}`)
  return `https://maps.apple.com/?daddr=${m.lat},${m.lng}&q=${q}`
}
