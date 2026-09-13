import { useEffect, useState } from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'set'; setId: string; variantId?: string }
  | { name: 'lot' }
  | { name: 'settings' }
  | { name: 'import' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0]
  const parts = path.split('/').filter(Boolean)
  // The set list lives on the Collection page now. Old links still land
  // somewhere sensible rather than on a blank screen.
  if (parts[0] === 'sets') return { name: 'dashboard' }
  if (parts[0] === 'set' && parts[1]) return { name: 'set', setId: parts[1], variantId: parts[2] }
  // Renamed from "search" once the page grew a pile to price up; old links
  // and home-screen shortcuts still land on it.
  if (parts[0] === 'lot' || parts[0] === 'search') return { name: 'lot' }
  if (parts[0] === 'settings') return { name: 'settings' }
  if (parts[0] === 'import') return { name: 'import' }
  return { name: 'dashboard' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith('#') ? to : `#${to}`
}

export const routeHref = {
  dashboard: '#/',
  lot: '#/lot',
  settings: '#/settings',
  import: '#/import',
  set: (setId: string, variantId?: string) => `#/set/${setId}${variantId ? `/${variantId}` : ''}`,
}
