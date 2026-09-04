/**
 * CSV/TSV parsing for spreadsheet imports. Hand-rolled because the rules that
 * matter here are few — quoted fields, escaped quotes, newlines inside quotes —
 * and exports from Excel, Numbers and Google Sheets all honour them.
 */

export interface ParsedSheet {
  headers: string[]
  rows: string[][]
  delimiter: string
}

/** Picks whichever delimiter appears most consistently across the first rows. */
function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n')
  const candidates = [',', '\t', ';']
  let best = ','
  let bestScore = -1
  for (const d of candidates) {
    // Count only delimiters outside quotes, so "Charizard, Base" doesn't vote.
    let count = 0
    let inQuotes = false
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i]
      if (ch === '"') inQuotes = !inQuotes
      else if (ch === d && !inQuotes) count++
    }
    if (count > bestScore) {
      bestScore = count
      best = d
    }
  }
  return best
}

export function parseCsv(input: string): ParsedSheet {
  // Strip the BOM Excel likes to prepend, or the first header goes unmatched.
  const text = input.replace(/^﻿/, '')
  const delimiter = detectDelimiter(text)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const cleaned = rows
    .map((r) => r.map((cell) => cell.trim()))
    .filter((r) => r.some((cell) => cell !== ''))

  if (cleaned.length === 0) return { headers: [], rows: [], delimiter }

  const [headers, ...body] = cleaned
  const width = headers.length
  // Pad short rows so column indexes stay valid for every row.
  const normalised = body.map((r) => (r.length >= width ? r.slice(0, width) : [...r, ...Array(width - r.length).fill('')]))

  return { headers: headers.map((h) => h.trim()), rows: normalised, delimiter }
}
