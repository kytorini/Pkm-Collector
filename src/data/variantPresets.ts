import { FIRST_EDITION, REVERSE_HOLO, SHADOWLESS, UNLIMITED } from './vintageSets'
import type { RegionId } from '../lib/regions'
import type { SetVariant } from '../types'

/**
 * Which print runs a set is tracked in.
 *
 * The sixteen vintage sets had their runs written out by hand, which stops
 * working the moment any set can be added. A preset is picked instead — one
 * is suggested from the set's age and region, and it can be changed on the
 * way in or afterwards, because only the collector knows whether they care
 * about reverse holos.
 */
export interface VariantPreset {
  id: string
  label: string
  /** What the runs are, in the order the tabs show them. */
  variants: SetVariant[]
  hint: string
}

/** A set tracked as one run: no distinction worth keeping, so none is made. */
const SINGLE: SetVariant = {
  ...UNLIMITED,
  label: 'Base',
  short: 'Base',
  note: undefined,
}

export const VARIANT_PRESETS: VariantPreset[] = [
  {
    id: 'single',
    label: 'One print run',
    variants: [SINGLE],
    hint: 'One slot per card. Right for most sets.',
  },
  {
    id: 'reverse',
    label: 'Normal + Reverse Holo',
    variants: [{ ...UNLIMITED, label: 'Normal', short: 'Normal' }, REVERSE_HOLO],
    hint: 'Modern sets, where most cards exist in both.',
  },
  {
    id: 'first-unlimited',
    label: '1st Edition + Unlimited',
    variants: [FIRST_EDITION, UNLIMITED],
    hint: 'Vintage runs carrying an "Edition 1" stamp.',
  },
  {
    id: 'base-set',
    label: '1st Edition + Shadowless + Unlimited',
    variants: [FIRST_EDITION, SHADOWLESS, UNLIMITED],
    hint: 'Base Set only — the three printings collectors separate.',
  },
]

const BY_ID = new Map(VARIANT_PRESETS.map((p) => [p.id, p]))

export function getPreset(id: string): VariantPreset {
  return BY_ID.get(id) ?? VARIANT_PRESETS[0]
}

/**
 * What to split a set by before its cards have arrived.
 *
 * Deliberately timid. This used to hand every set from 2002 on a reverse holo
 * run on the grounds that most modern sets have one — which invents a second
 * slot for every card in the ones that don't, and there are plenty: a set
 * printed entirely in reverse holo, or entirely in holo, ends up asking for
 * twice the cards it contains.
 *
 * Over-counting is the worse error, because it is silent: the completion bar
 * and the remaining cost are simply wrong and nothing says so. So one run is
 * assumed, and `detectVariants` reads the real answer off the cards as soon
 * as they land.
 *
 * The one guess kept is the "Edition 1" stamp on early Western sets, which is
 * reliable and matters before any price arrives. Japanese sets carried it only
 * in the earliest years and Chinese ones never did, so it is never suggested
 * outside English.
 */
export function suggestPreset(region: RegionId, year: number | undefined): string {
  if (region === 'en' && year != null && year >= 1999 && year <= 2000) return 'first-unlimited'
  return 'single'
}
