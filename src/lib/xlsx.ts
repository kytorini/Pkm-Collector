import { unzipSync, strFromU8 } from 'fflate'
import type { ParsedSheet } from './csv'

/**
 * Reads .xlsx workbooks. An xlsx is a zip of XML parts, and the parts we need
 * are small: the workbook's sheet list, the shared-string table, and each
 * sheet's cell grid. Doing it directly keeps the dependency to an unzipper
 * rather than a full spreadsheet library.
 */

export interface WorkbookSheet extends ParsedSheet {
  name: string
}

const parser = new DOMParser()

function parseXml(text: string): Document {
  return parser.parseFromString(text, 'application/xml')
}

/** "A" -> 0, "Z" -> 25, "AA" -> 26. */
function columnIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, '')
  let index = 0
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64)
  return index - 1
}

/** Shared strings hold the text of most cells, indexed by number. */
function readSharedStrings(files: Record<string, Uint8Array>): string[] {
  const raw = files['xl/sharedStrings.xml']
  if (!raw) return []
  const doc = parseXml(strFromU8(raw))
  return [...doc.getElementsByTagName('si')].map((si) => {
    // Runs of differently formatted text inside one cell are separate <t>s.
    const texts = si.getElementsByTagName('t')
    let out = ''
    for (const t of texts) out += t.textContent ?? ''
    return out
  })
}

/**
 * Excel stores dates as a day count from 1899-12-30. Cells carrying a date
 * format are converted so a "bought on" column imports as a readable date
 * instead of a five-digit number.
 */
function isDateFormat(code: string | null): boolean {
  if (!code) return false
  const stripped = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '')
  return /[dmyh]/i.test(stripped) && /[dmy]/i.test(stripped)
}

function readDateStyles(files: Record<string, Uint8Array>): Set<number> {
  const raw = files['xl/styles.xml']
  const dateStyles = new Set<number>()
  if (!raw) return dateStyles
  const doc = parseXml(strFromU8(raw))

  const customFormats = new Map<number, string>()
  for (const fmt of doc.getElementsByTagName('numFmt')) {
    const id = Number(fmt.getAttribute('numFmtId'))
    const code = fmt.getAttribute('formatCode')
    if (Number.isFinite(id) && code) customFormats.set(id, code)
  }
  // Built-in numeric formats 14-22 and 45-47 are the date and time ones.
  const builtInDate = (id: number) => (id >= 14 && id <= 22) || (id >= 45 && id <= 47)

  const cellXfs = doc.getElementsByTagName('cellXfs')[0]
  if (!cellXfs) return dateStyles
  ;[...cellXfs.getElementsByTagName('xf')].forEach((xf, i) => {
    const id = Number(xf.getAttribute('numFmtId'))
    if (!Number.isFinite(id)) return
    if (builtInDate(id) || isDateFormat(customFormats.get(id) ?? null)) dateStyles.add(i)
  })
  return dateStyles
}

function excelSerialToDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? String(serial) : date.toISOString().slice(0, 10)
}

function readSheet(xml: string, shared: string[], dateStyles: Set<number>): string[][] {
  const doc = parseXml(xml)
  const rows: string[][] = []

  for (const row of doc.getElementsByTagName('row')) {
    const cells: string[] = []
    for (const c of row.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') ?? ''
      const index = ref ? columnIndex(ref) : cells.length
      const type = c.getAttribute('t')
      const styleAttr = c.getAttribute('s')

      let value = ''
      if (type === 'inlineStr') {
        const texts = c.getElementsByTagName('t')
        for (const t of texts) value += t.textContent ?? ''
      } else {
        const v = c.getElementsByTagName('v')[0]
        const raw = v?.textContent ?? ''
        if (type === 's') {
          value = shared[Number(raw)] ?? ''
        } else if (type === 'b') {
          // Checkbox columns land here — the importer reads TRUE/FALSE already.
          value = raw === '1' ? 'TRUE' : 'FALSE'
        } else if (type === 'e') {
          value = '' // an error cell such as #N/A carries nothing worth importing
        } else {
          const style = styleAttr ? Number(styleAttr) : NaN
          value = Number.isFinite(style) && dateStyles.has(style) && raw !== ''
            ? excelSerialToDate(Number(raw))
            : raw
        }
      }

      // Sparse rows skip empty cells, so pad to keep column positions honest.
      while (cells.length < index) cells.push('')
      cells[index] = value.trim()
    }
    rows.push(cells)
  }
  return rows
}

/** Sheet order and names come from the workbook part and its relationships. */
function sheetOrder(files: Record<string, Uint8Array>): { name: string; path: string }[] {
  const workbook = files['xl/workbook.xml']
  if (!workbook) return []
  const doc = parseXml(strFromU8(workbook))

  const rels = new Map<string, string>()
  const relsRaw = files['xl/_rels/workbook.xml.rels']
  if (relsRaw) {
    for (const rel of parseXml(strFromU8(relsRaw)).getElementsByTagName('Relationship')) {
      const id = rel.getAttribute('Id')
      const target = rel.getAttribute('Target')
      if (id && target) rels.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''))
    }
  }

  const out: { name: string; path: string }[] = []
  for (const sheet of doc.getElementsByTagName('sheet')) {
    const name = sheet.getAttribute('name') ?? 'Sheet'
    const rId =
      sheet.getAttribute('r:id') ??
      sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    const target = rId ? rels.get(rId) : undefined
    const path = `xl/${target ?? `worksheets/sheet${out.length + 1}.xml`}`
    if (files[path]) out.push({ name, path })
  }
  return out
}

export function parseXlsx(buffer: ArrayBuffer): WorkbookSheet[] {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(buffer))
  } catch {
    throw new Error('That file isn’t a readable .xlsx workbook.')
  }

  const shared = readSharedStrings(files)
  const dateStyles = readDateStyles(files)
  const sheets = sheetOrder(files)
  if (sheets.length === 0) throw new Error('No sheets found in that workbook.')

  return sheets.map(({ name, path }) => {
    const grid = readSheet(strFromU8(files[path]), shared, dateStyles).filter((r) =>
      r.some((cell) => cell !== ''),
    )
    if (grid.length === 0) return { name, headers: [], rows: [], delimiter: 'xlsx' }

    const [headers, ...body] = grid
    const width = headers.length
    const rows = body.map((r) =>
      r.length >= width ? r.slice(0, width) : [...r, ...Array(width - r.length).fill('')],
    )
    return { name, headers, rows, delimiter: 'xlsx' }
  })
}

/**
 * Identifies a workbook by its content, not its name. Files arriving from a
 * cloud drive on iOS can lose their extension or come through as a generic
 * binary type, and an xlsx is a zip, so its signature is the reliable tell.
 */
export function looksLikeXlsx(file: File, head?: Uint8Array): boolean {
  if (head && head.length >= 4) {
    // "PK\x03\x04" — the local file header every zip, and so every xlsx, starts with.
    const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
    if (isZip) return true
  }
  return /\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml')
}
