import { getSet, getVariant } from '../data/vintageSets'
import { priceFor } from './pricing'
import type { ApiCard, CollectionMap } from '../types'

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const csvCell = (value: unknown): string => {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Spreadsheet-shaped export — one row per owned card, prices included. */
export function collectionToCsv(collection: CollectionMap, allCards: ApiCard[]): string {
  const byId = new Map(allCards.map((c) => [c.id, c]))
  const header = [
    'Set', 'Year', 'Variation', 'Number', 'Card', 'Rarity',
    'Owned', 'Quantity', 'Condition', 'Grader', 'Grade',
    'Price paid', 'Market price', 'Price is approximate', 'Notes', 'Updated',
  ]
  const rows = Object.values(collection)
    .filter((e) => e.owned)
    .map((entry) => {
      const card = byId.get(entry.cardId)
      const setId = card?.set.id ?? entry.cardId.split('-')[0]
      const set = getSet(setId)
      const variant = getVariant(setId, entry.variantId)
      const price = card && variant ? priceFor(card, variant) : null
      return [
        set?.name ?? setId,
        set?.year ?? '',
        variant?.label ?? entry.variantId,
        card?.number ?? '',
        card?.name ?? entry.cardId,
        card?.rarity ?? '',
        'Yes',
        entry.quantity,
        entry.condition,
        entry.graded?.company ?? '',
        entry.graded?.grade ?? '',
        entry.pricePaid ?? '',
        price?.market ?? '',
        price?.approximate ? 'Yes' : '',
        entry.notes ?? '',
        entry.updatedAt,
      ]
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[2]).localeCompare(String(b[2])))

  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
}

export interface BackupFile {
  app: 'pkm-collector'
  version: 1
  exportedAt: string
  collection: CollectionMap
}

export function collectionToJson(collection: CollectionMap): string {
  const backup: BackupFile = {
    app: 'pkm-collector',
    version: 1,
    exportedAt: new Date().toISOString(),
    collection,
  }
  return JSON.stringify(backup, null, 2)
}

export function parseBackup(text: string): CollectionMap {
  const parsed = JSON.parse(text) as Partial<BackupFile>
  if (!parsed || typeof parsed !== 'object' || !parsed.collection) {
    throw new Error('That file is not a Pkm Collector backup.')
  }
  return parsed.collection
}
