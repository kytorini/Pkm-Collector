import { useEffect, useState } from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'sets' }
  | { name: 'set'; setId: string; variantId?: string }
  | { name: 'search' }
  | { name: 'settings' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0]
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'sets') return { name: 'sets' }
  if (parts[0] === 'set' && parts[1]) return { name: 'set', setId: parts[1], variantId: parts[2] }
  if (parts[0] === 'search') return { name: 'search' }
  if (parts[0] === 'settings') return { name: 'settings' }
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
  sets: '#/sets',
  search: '#/search',
  settings: '#/settings',
  set: (setId: string, variantId?: string) => `#/set/${setId}${variantId ? `/${variantId}` : ''}`,
}
