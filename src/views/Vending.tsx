import { useEffect, useMemo, useState } from 'react'
import { BackToTop } from '../components/BackToTop'
import {
  directionsUrl,
  isNew,
  isStale,
  loadVending,
  milesBetween,
  type VendingData,
  type VendingMachine,
} from '../lib/vending'

type Where = { lat: number; lng: number }

/** How far is worth listing once your location is known. */
const RADII = [10, 25, 50, 100] as const

/**
 * Pokémon TCG vending machines near you, nearest first, from the official
 * locator's list as of its last weekly check. Machines that appeared in the
 * last month are marked new.
 */
export function Vending() {
  const [data, setData] = useState<VendingData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [here, setHere] = useState<Where | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [radius, setRadius] = useState<number>(25)
  const [query, setQuery] = useState('')
  const [newOnly, setNewOnly] = useState(false)

  useEffect(() => {
    loadVending().then(setData, (err: unknown) =>
      setError(err instanceof Error ? err.message : 'The machine list could not be loaded.'),
    )
  }, [])

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setLocateError('This device can’t share its location. Search by city, state or ZIP instead.')
      return
    }
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => {
        setLocateError('Location wasn’t shared. Allow it for this app, or search by city, state or ZIP.')
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    )
  }

  const now = Date.now()
  const listed = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    let rows = data.machines.map((m) => ({ m, miles: here ? milesBetween(here, m) : null, fresh: isNew(m, now) }))
    if (q) {
      rows = rows.filter(({ m }) =>
        [m.name, m.address, m.city, m.state, m.zip].some((f) => f.toLowerCase().includes(q)),
      )
    } else if (here) {
      rows = rows.filter((r) => r.miles != null && r.miles <= radius)
    }
    if (newOnly) rows = rows.filter((r) => r.fresh)
    return rows.sort((a, b) =>
      a.miles != null && b.miles != null
        ? a.miles - b.miles
        : a.m.state.localeCompare(b.m.state) || a.m.city.localeCompare(b.m.city),
    )
  }, [data, here, radius, query, newOnly, now])

  const newCount = data ? data.machines.filter((m) => isNew(m, now)).length : 0
  const checked = data?.checkedAt ? new Date(data.checkedAt).toLocaleDateString() : null

  return (
    <div className="view">
      <header className="view-head">
        <h1>Vending machines</h1>
      </header>

      {error && <div className="error-banner"><p>{error}</p></div>}

      {data && data.machines.length === 0 ? (
        <section className="panel">
          <h2>No machine list yet</h2>
          <p className="muted">
            Locations come from The Pokémon Company’s official locator and are rechecked every week. The
            first check hasn’t run yet, so there’s nothing to show. Until it does, the official map is here:
          </p>
          <a className="btn" href={data.source} target="_blank" rel="noreferrer noopener">
            Open the official locator ↗
          </a>
        </section>
      ) : data ? (
        <>
          <div className="toolbar vm-toolbar">
            <input
              className="search-input"
              type="search"
              placeholder="City, state or ZIP"
              aria-label="Search machines by city, state or ZIP"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn" onClick={locate} disabled={locating}>
              {locating ? 'Finding you…' : here ? 'Update location' : 'Near me'}
            </button>
            {here && !query && (
              <select
                className="select select-compact"
                value={radius}
                aria-label="Distance"
                onChange={(e) => setRadius(Number(e.target.value))}
              >
                {RADII.map((r) => (
                  <option key={r} value={r}>Within {r} mi</option>
                ))}
              </select>
            )}
            {newCount > 0 && (
              <label className="check-inline">
                <input type="checkbox" checked={newOnly} onChange={(e) => setNewOnly(e.target.checked)} />
                New only · {newCount}
              </label>
            )}
          </div>
          {locateError && <p className="muted small pad">{locateError}</p>}

          <p className="muted small pad">
            {data.machines.length} machines from the official locator
            {checked ? `, checked ${checked}` : ''}.
            {isStale(data, now) && ' The weekly check is overdue, so recent changes may be missing.'}
          </p>

          {!here && !query ? (
            <p className="muted pad">Tap <strong>Near me</strong>, or search for a city, state or ZIP.</p>
          ) : listed.length === 0 ? (
            <p className="muted pad">
              {query ? 'No machines match that search.' : `No machines within ${radius} miles.`}
            </p>
          ) : (
            <ul className="result-list">
              {listed.map(({ m, miles, fresh }) => (
                <MachineRow key={m.id} machine={m} miles={miles} fresh={fresh} />
              ))}
            </ul>
          )}
          {listed.length > 6 && <BackToTop />}
        </>
      ) : (
        !error && <p className="muted pad">Loading machines…</p>
      )}
    </div>
  )
}

function MachineRow({ machine: m, miles, fresh }: { machine: VendingMachine; miles: number | null; fresh: boolean }) {
  return (
    <li className="result vm-row">
      <div className="result-main">
        <span className="result-title">
          <strong>{m.name}</strong>
          {fresh && <span className="vm-new">New</span>}
        </span>
        <span className="muted small">
          {m.address}, {m.city}, {m.state} {m.zip}
        </span>
      </div>
      <div className="vm-side">
        {miles != null && <span className="vm-miles">{miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi</span>}
        <a className="btn small" href={directionsUrl(m)} target="_blank" rel="noreferrer noopener">
          Directions
        </a>
      </div>
    </li>
  )
}
