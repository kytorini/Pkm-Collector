/**
 * Reads a price out of whatever got copied.
 *
 * What lands on the clipboard from a price site is rarely a bare number: it
 * comes with a currency symbol, thousands separators, a label like "Ungraded",
 * or several grades at once.
 */
export function parsePastedPrice(raw: string): number | null {
  if (!raw) return null
  // Web pages hand over non-breaking spaces, which no number regex expects.
  const text = raw.replace(/\u00a0/g, ' ')

  // Copying the link rather than the price is an easy slip, and a card URL is
  // full of digits: .../pokemon-base-set/charizard-4 would otherwise be read
  // as $4 and recorded without a murmur.
  if (/[a-z][a-z0-9+.-]*:\/\//i.test(text) || /\bwww\./i.test(text)) return null

  // A figure written as money beats any other number present, so a copied
  // block like "Grade 9 $4,000.00" is not read as 9.
  const money = text.match(/[$\u20ac\u00a3]\s*(\d[\d,]*(?:\.\d+)?)/)
  // Failing that, a number standing on its own — never one inside a word,
  // which is what a URL slug or a "4/102" card number looks like.
  const standalone = text.match(/(?:^|[\s(])(\d[\d,]*(?:\.\d+)?)(?=$|[\s),;]|\.\s|\.$)/)
  const token = money?.[1] ?? standalone?.[1]
  if (!token) return null

  const n = Number(token.replace(/,/g, ''))
  // A zero isn't a price, and NaN means the token wasn't one either.
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Reads what someone is typing. Unlike the clipboard case this must accept a
 * half-finished number — "12." on the way to "12.50" — so it only strips the
 * decoration a person might type around it.
 */
export function parseTypedPrice(raw: string): number | null {
  const cleaned = raw.replace(/[$\s,]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}
