import { useMemo } from 'react'
import { usePriceRules } from '../lib/priceRules'
import { makePriceResolver, type PriceResolver } from '../lib/pricing'
import { useCollection } from './collection'

/**
 * The price reader for the current rules. Every view takes its numbers from
 * this, so a tile, a set total and the collection total can never disagree
 * about which source a card is priced from.
 */
export function usePrices(): PriceResolver {
  const rules = usePriceRules()
  const { get } = useCollection()
  return useMemo(() => makePriceResolver(rules, get), [rules, get])
}
