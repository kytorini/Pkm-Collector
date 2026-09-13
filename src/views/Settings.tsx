import { useEffect, useRef, useState } from 'react'
import { checkConnection, getApiKey, setApiKey, type ConnectionCheck } from '../api/pokemonTcg'
import { idbClear } from '../lib/idb'
import { collectionToCsv, collectionToJson, download, parseBackup } from '../lib/exporters'
import { useCollection } from '../store/collection'
import { useSync } from '../store/sync'
import { generateSyncCode } from '../lib/sync'
import { useLibrary } from '../store/library'
import { formatBytes, getPersistState, getStorageUse, requestPersistentStorage, type PersistState, type StorageUse } from '../lib/storage'
import { routeHref } from '../lib/router'
import { resetPriceRules, setCollectionSource, usePriceRules } from '../lib/priceRules'
import { PriceSourceSelect } from '../components/PriceSourceSelect'
import { CONDITIONS, type ConditionId } from '../types'

export function Settings() {
  const { collection, replaceAll, resetQuantities, resetConditions, defaultCondition, setDefaultCondition, ownedCount } =
    useCollection()
  const { allCards, syncAll, progress } = useLibrary()
  const [key, setKey] = useState(getApiKey())
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [persist, setPersist] = useState<PersistState | null>(null)
  const sync = useSync()
  const [showKey, setShowKey] = useState(false)
  const [check, setCheck] = useState<ConnectionCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [use, setUse] = useState<StorageUse | null>(null)
  const priceRules = usePriceRules()
  const perSetCount = Object.keys(priceRules.bySet).length
  const perRunCount = Object.keys(priceRules.byVariant ?? {}).length
  const perCardCount = Object.values(collection).filter((e) => e.priceSource).length
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void getPersistState().then(setPersist)
    void getStorageUse().then(setUse)
  }, [])

  const onSaveKey = () => {
    setApiKey(key)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const onImport = async (file: File) => {
    try {
      const next = parseBackup(await file.text())
      replaceAll(next)
      setMessage(`Imported ${Object.keys(next).length} entries.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const owned = Object.values(collection).filter((e) => e.owned)
  const multiCopy = owned.filter((e) => e.quantity > 1).length
  const totalCopies = owned.reduce((n, e) => n + Math.max(1, e.quantity || 1), 0)
  const assessed = owned.filter((e) => !e.graded && e.condition !== '-').length
  // Naming the worst offenders makes the cause obvious: a count of 6936 beside
  // a card that books at $69.36 says the Quantity column was a price column.
  const cardNames = new Map(allCards.map((c) => [c.id, `${c.name} #${c.number}`]))
  const worstCounts = [...owned].sort((a, b) => b.quantity - a.quantity).slice(0, 5)

  return (
    <div className="view narrow">
      <header className="view-head">
        <h1>Settings</h1>
      </header>

      <section className="panel">
        <h2>Your collection</h2>
        <p className="muted">
          {ownedCount} cards marked as owned. Everything lives in this browser — back it up before switching devices.
        </p>

        {/* Browser storage is durable, not guaranteed. Say which it is here
            rather than letting someone find out by losing their collection. */}
        {persist === 'persisted' && (
          <p className="note">
            Storage is marked persistent — this browser won't evict your collection to reclaim space.
            {use && use.usedBytes > 0 && ` Using ${formatBytes(use.usedBytes)}.`}
          </p>
        )}
        {persist === 'not-persisted' && (
          <p className="warn-note">
            This browser hasn't granted persistent storage, so it could clear your collection if the
            device runs very low on space.{' '}
            <button
              className="link-btn"
              onClick={() => void requestPersistentStorage().then(setPersist)}
            >
              Ask again
            </button>
            {' '}— and keep a JSON backup either way. Installing to the Home Screen usually grants it.
          </p>
        )}
        <div className="btn-row">
          <button className="btn" onClick={() => download(`pkm-collection-${stamp}.json`, collectionToJson(collection), 'application/json')}>
            Export backup (JSON)
          </button>
          <button className="btn" onClick={() => download(`pkm-collection-${stamp}.csv`, collectionToCsv(collection, allCards), 'text/csv')}>
            Export spreadsheet (CSV)
          </button>
          <button className="btn ghost" onClick={() => fileInput.current?.click()}>Import backup</button>
          <a className="btn ghost" href={routeHref.import}>Import a spreadsheet</a>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onImport(file)
              e.target.value = ''
            }}
          />
        </div>
        {message && <p className="note">{message}</p>}
      </section>

      <section className="panel">
        <h2>Pokémon TCG API key</h2>
        <p className="muted">
          Optional. Without a key you get about 1,000 requests a day, which is plenty once card data is cached.
          A free key at <a href="https://dev.pokemontcg.io/" target="_blank" rel="noreferrer noopener">dev.pokemontcg.io</a> raises it to 20,000.
        </p>
        <div className="btn-row">
          <input className="search-input" type="password" placeholder="Paste key" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn" onClick={onSaveKey}>{saved ? 'Saved' : 'Save key'}</button>
        </div>
      </section>

      <section className="panel">
        <h2>Sync across devices</h2>
        <p className="muted">
          Your collection lives on this device. Turning on sync keeps an iPhone and iPad carrying the same
          collection: each device merges rather than overwrites, so a card marked on one and a note added on
          the other both survive.
        </p>

        <details className="setup-steps">
          <summary>One-time setup (about five minutes)</summary>
          <ol>
            <li>
              Create a free project at{' '}
              <a href="https://supabase.com" target="_blank" rel="noreferrer noopener">supabase.com</a>.
            </li>
            <li>
              Open the SQL editor and run this:
              <pre>{`create table collections (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table collections enable row level security;
create policy "sync" on collections
  for all using (true) with check (true);`}</pre>
            </li>
            <li>In Project Settings → API, copy the Project URL and the <strong>anon</strong> key into the boxes below.</li>
            <li>On your other device, open Settings and enter the same three values, including the sync code.</li>
          </ol>
          <p className="muted small">
            The sync code is the secret: anyone holding it and the key can read this collection. Use the
            generated one rather than something memorable, and don't post it anywhere. The anon key is meant
            to live in a browser, and nothing here is ever committed to the repository.
          </p>
        </details>

        <div className="map-grid" style={{ marginTop: 14 }}>
          <label>
            <span>Project URL</span>
            <input
              type="url"
              placeholder="https://xxxx.supabase.co"
              value={sync.settings.url}
              onChange={(e) => sync.update({ url: e.target.value })}
            />
          </label>
          <label>
            <span>Anon key</span>
            <input
              type={showKey ? 'text' : 'password'}
              placeholder="eyJhbGciOi…"
              value={sync.settings.anonKey}
              onChange={(e) => sync.update({ anonKey: e.target.value })}
            />
            <button className="link-btn" onClick={() => setShowKey((v) => !v)}>
              {showKey ? 'Hide key' : 'Show key'}
            </button>
          </label>
          <label className="full">
            <span>Sync code — the same on every device</span>
            <input
              type="text"
              placeholder="tap Generate"
              value={sync.settings.syncCode}
              onChange={(e) => sync.update({ syncCode: e.target.value.trim() })}
            />
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button className="link-btn" onClick={() => sync.update({ syncCode: generateSyncCode() })}>
                Generate a new code
              </button>
              {sync.settings.syncCode && (
                <button
                  className="link-btn"
                  onClick={() => {
                    void navigator.clipboard?.writeText(sync.settings.syncCode)
                    setMessage('Sync code copied.')
                  }}
                >
                  Copy code
                </button>
              )}
            </div>
          </label>
        </div>

        <label className={`sheet-all ${sync.settings.enabled ? 'is-active' : ''}`} style={{ marginTop: 14 }}>
          <input
            type="checkbox"
            checked={sync.settings.enabled}
            disabled={!sync.configured}
            onChange={(e) => sync.update({ enabled: e.target.checked })}
          />
          <span>
            <strong>Keep this device in sync</strong>
            <em>
              {sync.configured
                ? 'Syncs when the app opens, when you switch back to it, and shortly after you make changes'
                : 'Fill in all three boxes above to enable'}
            </em>
          </span>
        </label>

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" disabled={!sync.configured || sync.state === 'syncing'} onClick={() => void sync.syncNow()}>
            {sync.state === 'syncing' ? 'Syncing…' : 'Sync now'}
          </button>
        </div>

        {sync.error && <p className="warn-note">{sync.error}</p>}
        {!sync.error && sync.state === 'ok' && sync.lastResult && (
          <>
            <p className="note">
              Synced{sync.lastSyncedAt ? ` at ${new Date(sync.lastSyncedAt).toLocaleTimeString()}` : ''} —
              {' '}<strong>{sync.lastResult.total} cards in sync</strong>
              {sync.lastResult.pulled === 0 && sync.lastResult.pushed === 0
                ? ' (already up to date)'
                : ` (${sync.lastResult.pulled} in, ${sync.lastResult.pushed} out)`}
              {sync.lastResult.conflicts > 0 && `, ${sync.lastResult.conflicts} resolved by most recent edit`}
              {sync.lastResult.removed > 0 && `, ${sync.lastResult.removed} removed elsewhere`}.
            </p>
            {sync.lastResult.heldBack > 0 && (
              <p className="warn-note">
                {sync.lastResult.heldBack} cards are missing from the other device's copy — too many to be a
                deliberate deletion, so nothing was removed here. This usually means the other device synced
                while its collection was empty. Check it, then sync again from whichever device holds the
                collection you want to keep.
              </p>
            )}
          </>
        )}
        {!sync.error && sync.state !== 'ok' && sync.lastSyncedAt > 0 && (
          <p className="muted small">Last synced {new Date(sync.lastSyncedAt).toLocaleString()}.</p>
        )}
      </section>

      <section className="panel">
        <h2>Connection test</h2>
        <p className="muted">
          Card names, artwork and prices come from the Pokémon TCG API. If a set won't load, this says whether
          the API is reachable from this device.
        </p>
        <div className="btn-row">
          <button
            className="btn"
            disabled={checking}
            onClick={async () => {
              setChecking(true)
              setCheck(null)
              try {
                setCheck(await checkConnection())
              } finally {
                setChecking(false)
              }
            }}
          >
            {checking ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        {check && (
          <p className={check.ok ? 'note' : 'warn-note'}>
            {check.ok ? '✓ ' : '✕ '}
            {check.detail}
            {check.status ? ` (HTTP ${check.status})` : ''}
            {!check.ok && ' — the app keeps working with whatever it already cached.'}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Card data</h2>
        <p className="muted">
          Card text, artwork and prices are cached on this device. Refresh to pull current market prices.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => void syncAll(true)} disabled={progress.running}>
            {progress.running ? `Refreshing ${progress.current}…` : 'Refresh all sets'}
          </button>
          <button
            className="btn ghost danger"
            onClick={async () => {
              if (!confirm('Clear cached card data? Your collection is kept. The next load re-downloads it.')) return
              await idbClear()
              location.reload()
            }}
          >
            Clear card cache
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Pricing</h2>
        <PriceSourceSelect
          level="collection"
          id="collection-price-source"
          label="Where prices come from, unless a set or card says otherwise"
          value={priceRules.collection}
          onChange={setCollectionSource}
        />

        <p className="muted">
          Auto reads each print run's own TCGplayer listing, and never borrows another run's — a 1st Edition
          card is not priced off the Unlimited listing. When a run has no listing of its own that leaves a
          gap, and naming a source here fills it. Anything other than Auto is taken literally: a card the
          chosen source doesn't cover shows no price rather than a substituted one.
        </p>
        <p className="muted">
          A set page overrides this per print run — 1st Edition and Unlimited are different markets, and one
          can have no feed of its own while the other is priced fine — or for the whole set at once. A single
          card overrides both from its panel, where you can also type a figure you read on PriceCharting or
          eBay, which those sites don't publish in a form the app can read. The most specific setting wins:
          card, then print run, then set, then here. Per-card prices are part of your collection and sync
          between devices; everything else here is per device, like grid density.
        </p>
        {(perSetCount > 0 || perRunCount > 0 || perCardCount > 0) && (
          <>
            <p className="muted">
              {perRunCount > 0 && `${perRunCount} print run${perRunCount === 1 ? '' : 's'} override this. `}
              {perSetCount > 0 && `${perSetCount} whole set${perSetCount === 1 ? '' : 's'} override this. `}
              {perCardCount > 0 && `${perCardCount} card${perCardCount === 1 ? '' : 's'} have their own source.`}
            </p>
            {perSetCount + perRunCount > 0 && (
              <button
                className="btn"
                onClick={() => {
                  if (!confirm(`Clear the price source on all ${perSetCount + perRunCount} sets and print runs? Prices you typed in are kept, and so are per-card sources.`)) return
                  resetPriceRules()
                  setMessage('Every set and print run is back to the collection default.')
                }}
              >
                Clear the per-set and per-run choices
              </button>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h2>Condition</h2>
        <label className="labelled-select">
          <span>Applied when you tick a card straight from the grid</span>
          <select
            className="select"
            value={defaultCondition}
            onChange={(e) => setDefaultCondition(e.target.value as ConditionId)}
          >
            {CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>

        <p className="muted">
          “Not assessed yet” is the zero state — owned, but not yet graded by eye. Unassessed cards count at
          the quoted market price, and every set shows how many are still waiting, so a total that leans on
          them reads as provisional.{' '}
          {assessed > 0
            ? `${assessed} of your ${ownedCount} cards have a condition set.`
            : 'None of your cards have a condition set yet.'}
        </p>
        {assessed > 0 && (
          <button
            className="btn"
            onClick={() => {
              if (!confirm(`Put all ${assessed} assessed cards back to “not assessed yet”? Graded cards keep their grade, and nothing else changes.`)) return
              const changed = resetConditions()
              setMessage(`${changed} ${changed === 1 ? 'card is' : 'cards are'} back to not assessed.`)
            }}
          >
            Set every condition to “not assessed yet”
          </button>
        )}
      </section>

      <section className="panel">
        <h2>Quantities</h2>
        <p className="muted">
          Collection value counts every copy, so a Quantity column pointed at the wrong thing during an
          import inflates it. {multiCopy > 0
            ? `${multiCopy} ${multiCopy === 1 ? 'entry holds' : 'entries hold'} more than one copy (${totalCopies} copies of ${ownedCount} cards).`
            : 'Every entry currently holds a single copy.'}
        </p>
        {multiCopy > 0 && (
          <ul className="qty-list">
            {worstCounts.map((e) => (
              <li key={`${e.cardId}::${e.variantId}`}>
                <span>{cardNames.get(e.cardId) ?? e.cardId}</span>
                <strong>×{e.quantity.toLocaleString()}</strong>
              </li>
            ))}
          </ul>
        )}
        {multiCopy > 0 && (
          <button
            className="btn"
            onClick={() => {
              if (!confirm(`Set all ${multiCopy} multi-copy entries back to a single copy? Conditions and notes are kept.`)) return
              const changed = resetQuantities()
              setMessage(`Reset ${changed} ${changed === 1 ? 'entry' : 'entries'} to one copy.`)
            }}
          >
            Reset all quantities to 1
          </button>
        )}
      </section>

      <section className="panel">
        <h2>Danger zone</h2>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm('Delete every owned mark, condition and note? This cannot be undone.')) replaceAll({})
          }}
        >
          Erase my collection
        </button>
      </section>
    </div>
  )
}
