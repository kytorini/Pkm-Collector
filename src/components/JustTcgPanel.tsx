import { useState } from 'react'
import { checkJustTcg, getJustTcgKey, justTcgUsage, setJustTcgKey } from '../api/justTcg'
import { canPrice, justTcgFor, refreshStale, useJustTcgVersion, type RefreshReport } from '../lib/justTcgPrices'
import { useSets } from '../lib/sets'

/**
 * Near-mint prices: the key, whether it works, what's left of the free
 * allowance, and which JustTCG set each of yours was paired with — the last
 * because a wrong pairing is the one failure that would quietly misprice a
 * whole set, and it is only visible if it is shown.
 */
export function JustTcgPanel() {
  const sets = useSets()
  useJustTcgVersion()
  const [key, setKey] = useState(getJustTcgKey)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const usage = justTcgUsage()
  const priceable = sets.filter(canPrice)

  const describe = (r: RefreshReport): string => {
    const parts: string[] = []
    if (r.refreshed.length) parts.push(`Priced ${r.refreshed.length} set${r.refreshed.length === 1 ? '' : 's'}.`)
    if (r.unmatched.length) parts.push(`No match found for ${r.unmatched.join(', ')}.`)
    if (r.deferred.length) parts.push(`${r.deferred.length} left for later to stay inside the free allowance.`)
    if (r.error) parts.push(r.error)
    return parts.join(' ') || 'Everything is up to date.'
  }

  const save = async () => {
    setJustTcgKey(key)
    if (!key.trim()) {
      setStatus('Key removed. Prices fall back to TCGplayer’s market price.')
      return
    }
    setBusy(true)
    setStatus('Checking the key…')
    try {
      const u = await checkJustTcg()
      setStatus(`Key works${u ? ` (${u.apiPlan} plan)` : ''}. Fetching near-mint prices…`)
      setStatus(describe(await refreshStale(sets)))
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'The key could not be checked.')
    } finally {
      setBusy(false)
    }
  }

  const refreshAll = async () => {
    if (!confirm(`Re-fetch near-mint prices for all ${priceable.length} sets now? This uses roughly one request per 20 cards.`)) return
    setBusy(true)
    setStatus('Fetching near-mint prices…')
    try {
      setStatus(describe(await refreshStale(sets, true)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>Near-mint prices (JustTCG)</h2>
      <p className="muted">
        TCGplayer prices split by condition, so cards are valued at what near-mint copies sell for, with
        1st Edition, Shadowless and Unlimited priced separately. With a key, these come first; TCGplayer’s
        market price fills any gaps. Free keys at{' '}
        <a href="https://justtcg.com/" target="_blank" rel="noreferrer noopener">justtcg.com</a>. Prices
        refresh weekly, inside the free plan’s 1,000 requests a month — every set’s holos first, then the
        commons, uncommons and reverse holos.
      </p>
      <div className="btn-row">
        <input
          className="search-input"
          type="password"
          placeholder="Paste JustTCG key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
        />
        <button className="btn" onClick={() => void save()} disabled={busy}>
          {busy ? 'Working…' : 'Save and test'}
        </button>
      </div>
      {status && <p className="note">{status}</p>}
      {usage && (
        <p className="muted small">
          {usage.apiRequestsRemaining} of {usage.apiRequestLimit} requests left this month,{' '}
          {usage.apiDailyRequestsRemaining} of {usage.apiDailyLimit} today.
        </p>
      )}

      {getJustTcgKey() && priceable.length > 0 && (
        <details className="setup-steps">
          <summary>How your sets were matched</summary>
          <ul className="jt-matches">
            {priceable.map((set) => {
              const held = justTcgFor(set.id)
              return (
                <li key={set.id}>
                  <strong>{set.name}</strong>{' '}
                  <span className="muted">
                    {!held
                      ? '— not fetched yet'
                      : held.matched.length === 0
                        ? '— no JustTCG set found'
                        : `→ ${held.matched.map((m) => m.name).join(' + ')} · ${new Date(held.fetchedAt).toLocaleDateString()}`}
                  </span>
                </li>
              )
            })}
          </ul>
          <button className="btn small" onClick={() => void refreshAll()} disabled={busy}>
            Refresh all now
          </button>
        </details>
      )}
    </section>
  )
}
