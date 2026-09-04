import { useMemo, useRef, useState } from 'react'
import { VINTAGE_SETS } from '../data/vintageSets'
import { parseCsv, type ParsedSheet } from '../lib/csv'
import { download } from '../lib/exporters'
import {
  MAPPABLE_FIELDS,
  applyPlan,
  buildCardIndex,
  buildPlan,
  guessMapping,
  matchVariantId,
  type ColumnMapping,
  type Layout,
  type MergeMode,
  type PlannedRow,
} from '../lib/importer'
import { routeHref } from '../lib/router'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'

/** Print runs a column can be assigned to in a wide sheet. */
const VARIANT_CHOICES = [
  { id: 'first-edition', label: '1st Edition' },
  { id: 'shadowless', label: 'Shadowless' },
  { id: 'unlimited', label: 'Unlimited' },
  { id: 'reverse-holo', label: 'Reverse Holo' },
]

export function Import() {
  const { allCards, empty } = useLibrary()
  const { collection, replaceAll, defaultCondition } = useCollection()
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [mode, setMode] = useState<MergeMode>('keep')
  const [done, setDone] = useState<{ entries: number } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const index = useMemo(() => buildCardIndex(allCards), [allCards])

  const plan = useMemo(
    () => (sheet && mapping ? buildPlan(sheet.rows, mapping, index, collection, defaultCondition) : null),
    [sheet, mapping, index, collection, defaultCondition],
  )

  const onFile = async (file: File) => {
    setParseError(null)
    setDone(null)
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.headers.length === 0) throw new Error('That file has no rows.')
      if (parsed.rows.length === 0) throw new Error('That file has a header but no data rows.')
      setSheet(parsed)
      setFileName(file.name)
      setMapping(guessMapping(parsed.headers))
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  // Changing anything after an import invalidates the "done" note — the user
  // is setting up another pass, so give them the button back.
  const patch = (next: Partial<ColumnMapping>) => {
    setDone(null)
    setMapping((m) => (m ? { ...m, ...next } : m))
  }

  const chooseMode = (next: MergeMode) => {
    setDone(null)
    setMode(next)
  }

  const onImport = () => {
    if (!plan) return
    replaceAll(applyPlan(plan, collection, mode))
    setDone({ entries: plan.entryCount })
  }

  const reset = () => {
    setSheet(null)
    setMapping(null)
    setDone(null)
    setFileName('')
  }

  if (empty) {
    return (
      <div className="view narrow">
        <header className="view-head"><h1>Import a spreadsheet</h1></header>
        <p className="muted">
          Card data needs to be downloaded first — the importer matches your rows against real cards.{' '}
          <a href={routeHref.dashboard}>Go to Collection</a> and download it, then come back.
        </p>
      </div>
    )
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Import a spreadsheet</h1>
        <p className="muted">
          Your rows are matched to real cards and print runs. Nothing is written until you say so.
        </p>
      </header>

      {/* ---- step 1: the file ---- */}
      <section className="panel">
        <h2>1. Your file</h2>
        {sheet ? (
          <p className="muted">
            <strong>{fileName}</strong> — {sheet.rows.length} rows, {sheet.headers.length} columns
            {sheet.delimiter === '\t' ? ', tab-separated' : sheet.delimiter === ';' ? ', semicolon-separated' : ''}.{' '}
            <button className="link-btn" onClick={reset}>Choose a different file</button>
          </p>
        ) : (
          <>
            <p className="muted">
              Export your sheet as CSV first — in Excel, Numbers or Google Sheets that's File → Export / Download → CSV.
              One row per card, however your columns are named.
            </p>
            <div className="btn-row">
              <button className="btn primary" onClick={() => fileInput.current?.click()}>Choose CSV file</button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onFile(file)
                  e.target.value = ''
                }}
              />
            </div>
          </>
        )}
        {parseError && <p className="error-banner" style={{ marginTop: 12 }}>{parseError}</p>}
      </section>

      {sheet && mapping && (
        <>
          {/* ---- step 2: the columns ---- */}
          <section className="panel">
            <h2>2. What your columns mean</h2>
            <p className="muted">Guessed from your headers — correct anything that's wrong.</p>

            <div className="layout-toggle">
              <label className={mapping.layout === 'long' ? 'is-active' : ''}>
                <input
                  type="radio"
                  checked={mapping.layout === 'long'}
                  onChange={() => patch({ layout: 'long' as Layout, variantColumns: {} })}
                />
                <span>
                  <strong>A column names the print run</strong>
                  <em>One row per card, with a “1st Edition / Shadowless / Unlimited” column</em>
                </span>
              </label>
              <label className={mapping.layout === 'wide' ? 'is-active' : ''}>
                <input
                  type="radio"
                  checked={mapping.layout === 'wide'}
                  onChange={() => {
                    const guessed: Record<number, string> = {}
                    sheet.headers.forEach((h, i) => {
                      const id = matchVariantId(h)
                      if (id) guessed[i] = id
                    })
                    patch({ layout: 'wide' as Layout, variantColumns: guessed, variation: null })
                  }}
                />
                <span>
                  <strong>A column per print run</strong>
                  <em>One row per card, with separate 1st Edition / Shadowless / Unlimited columns</em>
                </span>
              </label>
            </div>

            <div className="map-grid">
              {MAPPABLE_FIELDS.filter((f) => !(mapping.layout === 'wide' && (f.field === 'variation' || f.field === 'owned'))).map(
                (f) => (
                  <label key={f.field}>
                    <span>{f.label}</span>
                    <select
                      value={(mapping[f.field] as number | null) ?? ''}
                      onChange={(e) => patch({ [f.field]: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      <option value="">— not in my sheet —</option>
                      {sheet.headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                    <em className="map-hint">{f.hint}</em>
                  </label>
                ),
              )}
            </div>

            {mapping.layout === 'wide' && (
              <div className="wide-cols">
                <h3>Which columns are print runs?</h3>
                <p className="muted">
                  A card counts as owned when its cell has anything in it. If the cell holds a condition
                  (“NM”, “PSA 9”) that's used too.
                </p>
                <div className="map-grid">
                  {sheet.headers.map((h, i) => (
                    <label key={i}>
                      <span>{h || `Column ${i + 1}`}</span>
                      <select
                        value={mapping.variantColumns[i] ?? ''}
                        onChange={(e) => {
                          const next = { ...mapping.variantColumns }
                          if (e.target.value) next[i] = e.target.value
                          else delete next[i]
                          patch({ variantColumns: next })
                        }}
                      >
                        <option value="">— not a print run —</option>
                        {VARIANT_CHOICES.map((v) => (
                          <option key={v.id} value={v.id}>{v.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="map-grid fallbacks">
              {mapping.set == null && (
                <label>
                  <span>My sheet has no Set column — it's all…</span>
                  <select
                    value={mapping.fallbackSetId ?? ''}
                    onChange={(e) => patch({ fallbackSetId: e.target.value || null })}
                  >
                    <option value="">— match by card name across all sets —</option>
                    {VINTAGE_SETS.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
              )}
              {mapping.layout === 'long' && (
                <label>
                  <span>When a row doesn't say which print run</span>
                  <select
                    value={mapping.defaultVariantId ?? ''}
                    onChange={(e) => patch({ defaultVariantId: e.target.value || null })}
                  >
                    <option value="">— skip the row —</option>
                    {VARIANT_CHOICES.map((v) => (
                      <option key={v.id} value={v.id}>Treat as {v.label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </section>

          {/* ---- step 3: review ---- */}
          {plan && (
            <section className="panel">
              <h2>3. What will happen</h2>

              <div className="import-counts">
                <div className="import-count ok">
                  <strong>{plan.entryCount}</strong>
                  <span>cards to import</span>
                </div>
                <div className={`import-count ${plan.clashCount ? 'warn' : ''}`}>
                  <strong>{plan.clashCount}</strong>
                  <span>already in your collection</span>
                </div>
                <div className={`import-count ${plan.warned.length ? 'warn' : ''}`}>
                  <strong>{plan.warned.length}</strong>
                  <span>worth checking</span>
                </div>
                <div className={`import-count ${plan.unmatched.length ? 'bad' : ''}`}>
                  <strong>{plan.unmatched.length}</strong>
                  <span>couldn't be matched</span>
                </div>
                <div className="import-count">
                  <strong>{plan.skipped.length}</strong>
                  <span>skipped</span>
                </div>
              </div>

              {plan.entryCount > 0 && (
                <>
                  <h3>Preview</h3>
                  <div className="table-scroll">
                    <table className="preview-table">
                      <thead>
                        <tr><th>Row</th><th>Card</th><th>Set</th><th>Print run</th><th>Condition</th><th>Qty</th><th>Paid</th></tr>
                      </thead>
                      <tbody>
                        {plan.ready.slice(0, 12).flatMap((row) =>
                          row.entries.map((e) => (
                            <tr key={e.key} className={e.clashes ? 'is-clash' : ''}>
                              <td className="muted">{row.rowNumber}</td>
                              <td>#{e.cardNumber} {e.cardName}</td>
                              <td className="muted">{e.setName}</td>
                              <td>{e.variantLabel}</td>
                              <td>{e.entry.graded ? `${e.entry.graded.company} ${e.entry.graded.grade}` : e.entry.condition}</td>
                              <td>{e.entry.quantity}</td>
                              <td>{e.entry.pricePaid != null ? e.entry.pricePaid : ''}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                  {plan.entryCount > 12 && <p className="muted small">…and {plan.entryCount - 12} more.</p>}
                  {plan.clashCount > 0 && (
                    <p className="muted small">
                      Highlighted rows are already in your collection — what happens to them depends on the choice below.
                    </p>
                  )}
                </>
              )}

              <IssueList
                title="Matched, but the sheet says otherwise"
                tone="warn"
                rows={plan.warned}
              />
              <IssueList
                title="Couldn't be matched — these will be left out"
                tone="bad"
                rows={plan.unmatched}
                onExport={
                  plan.unmatched.length
                    ? () =>
                        download(
                          'unmatched-rows.csv',
                          ['Row,Card,Reason', ...plan.unmatched.map((r) => `${r.rowNumber},"${r.label.replace(/"/g, '""')}","${(r.reason ?? '').replace(/"/g, '""')}"`)].join('\n'),
                          'text/csv',
                        )
                    : undefined
                }
              />

              <h3>If a card is already in my collection</h3>
              <div className="mode-choices">
                {(
                  [
                    ['keep', 'Keep what I already have', 'Only adds cards the collection is missing'],
                    ['overwrite', 'Let the spreadsheet win', 'Overwrites condition, quantity and notes on clashes'],
                    ['replace', 'Replace my whole collection', 'Deletes everything not in this sheet'],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label key={value} className={mode === value ? 'is-active' : ''}>
                    <input type="radio" name="merge" checked={mode === value} onChange={() => chooseMode(value)} />
                    <span><strong>{label}</strong><em>{hint}</em></span>
                  </label>
                ))}
              </div>

              {done ? (
                <p className="note">
                  Imported {done.entries} cards. <a href={routeHref.dashboard}>See your collection →</a>
                </p>
              ) : (
                <div className="btn-row">
                  <button className="btn primary" onClick={onImport} disabled={plan.entryCount === 0}>
                    {mode === 'replace' ? `Replace collection with ${plan.entryCount} cards` : `Import ${plan.entryCount} cards`}
                  </button>
                  {mode === 'replace' && <span className="muted small">Export a backup from Settings first.</span>}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function IssueList({
  title,
  tone,
  rows,
  onExport,
}: {
  title: string
  tone: 'warn' | 'bad'
  rows: PlannedRow[]
  onExport?: () => void
}) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null
  return (
    <div className={`issue-block tone-${tone}`}>
      <button className="issue-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{open ? '▾' : '▸'} {title} ({rows.length})</span>
      </button>
      {open && (
        <>
          <ul className="issue-list">
            {rows.slice(0, 100).map((r) => (
              <li key={r.rowNumber}>
                <span className="muted">Row {r.rowNumber}</span> <strong>{r.label}</strong> — {r.reason}
              </li>
            ))}
          </ul>
          {rows.length > 100 && <p className="muted small">…and {rows.length - 100} more.</p>}
          {onExport && <button className="link-btn" onClick={onExport}>Download these rows as CSV</button>}
        </>
      )}
    </div>
  )
}
