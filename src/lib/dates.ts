/**
 * How long ago a price was written down.
 *
 * Recorded prices are the one kind that never refresh themselves: the feed
 * updates daily, but a figure you read off a site in March is still March's
 * figure in September. So every recorded price carries the day it was entered,
 * and one old enough to mistrust says so.
 */

/** Past this, a hand-entered price is worth checking again. */
export const STALE_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

const startOfDay = (ms: number): number => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function daysSince(iso: string | undefined, now: number = Date.now()): number | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return null
  // Whole days apart, so a price entered last night reads as "yesterday"
  // rather than "13 hours ago".
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS))
}

/** "today", "yesterday", "12 days ago", then a plain date once that stops helping. */
export function recordedAgo(iso: string | undefined, now: number = Date.now()): string {
  const days = daysSince(iso, now)
  if (days == null) return ''
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(Date.parse(iso as string)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function isStalePrice(iso: string | undefined, now: number = Date.now()): boolean {
  const days = daysSince(iso, now)
  return days != null && days >= STALE_DAYS
}
