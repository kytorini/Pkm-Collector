import { useEffect, useRef, useState } from 'react'
import { getApiKey, setApiKey } from '../api/pokemonTcg'
import { idbClear } from '../lib/idb'
import { collectionToCsv, collectionToJson, download, parseBackup } from '../lib/exporters'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'
import { formatBytes, getPersistState, getStorageUse, requestPersistentStorage, type PersistState, type StorageUse } from '../lib/storage'
import { routeHref } from '../lib/router'
import { CONDITIONS, type ConditionId } from '../types'

export function Settings() {
  const { collection, replaceAll, defaultCondition, setDefaultCondition, ownedCount } = useCollection()
  const { allCards, syncAll, progress } = useLibrary()
  const [key, setKey] = useState(getApiKey())
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [persist, setPersist] = useState<PersistState | null>(null)
  const [use, setUse] = useState<StorageUse | null>(null)
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
        <h2>Default condition</h2>
        <p className="muted">Applied when you tick a card straight from the grid.</p>
        <select className="select" value={defaultCondition} onChange={(e) => setDefaultCondition(e.target.value as ConditionId)}>
          {CONDITIONS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
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
