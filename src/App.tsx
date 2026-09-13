import { useEffect, useMemo } from 'react'
import { getSet } from './data/vintageSets'
import { navigate, routeHref, useRoute } from './lib/router'
import { usePhone } from './lib/useMediaQuery'
import { CollectionProvider } from './store/collection'
import { LibraryProvider, useLibrary } from './store/library'
import { SyncProvider } from './store/sync'
import { Dashboard } from './views/Dashboard'
import { Import } from './views/Import'
import { Search } from './views/Search'
import { SetDetail } from './views/SetDetail'
import { Settings } from './views/Settings'

const NAV = [
  { href: routeHref.dashboard, label: 'Collection', icon: '◆', match: 'dashboard' },
  { href: routeHref.search, label: 'Search', icon: '⌕', match: 'search' },
  { href: routeHref.settings, label: 'Settings', icon: '⚙', match: 'settings' },
] as const

function Shell() {
  const route = useRoute()
  const phone = usePhone()
  const { progress } = useLibrary()

  // "/" jumps to search from anywhere, the way a binder index would.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        navigate(routeHref.search)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const active = route.name === 'set' ? 'dashboard' : route.name === 'import' ? 'settings' : route.name

  /*
   * Which set and print run you're in, named in the bar that never moves.
   *
   * The card feed has one scan per card, so an Unlimited grid and a 1st
   * Edition grid look identical; once the page header has scrolled away
   * there is nothing left saying which you're in. The route already knows,
   * so nothing has to be plumbed up from the view to ask it.
   */
  const here = useMemo(() => {
    if (route.name !== 'set') return null
    const set = getSet(route.setId)
    if (!set) return null
    const variant = set.variants.find((v) => v.id === route.variantId) ?? set.variants[0]
    return { set: set.name, variant: variant?.label ?? '' }
  }, [route])

  return (
    <div className="app">
      <header className={`topbar ${here ? 'has-title' : ''}`}>
        {/*
          On a phone inside a set, the mark becomes the way back. It already
          led here, and saying so lets the page drop its own back link — a
          whole row of a small screen for something the bar can carry free.
        */}
        <a
          className="brand"
          href={routeHref.dashboard}
          aria-label={here && phone ? 'Back to your collection' : 'Pkm Collector, your collection'}
        >
          <span className={`brand-mark ${here && phone ? 'is-back' : ''}`} aria-hidden>
            {here && phone ? '‹' : '◈'}
          </span>
          <span className="brand-name">Pkm Collector</span>
        </a>
        {here && (
          <p className="topbar-title">
            <span className="topbar-title-set">{here.set}</span>
            <span className="topbar-title-variant">{here.variant}</span>
          </p>
        )}
      </header>

      {/*
        A sibling of the top bar rather than a child: the bar's backdrop-filter
        makes it a containing block, which would pin this to the bar instead of
        the viewport and strand the phone tab bar at the top of the screen.
      */}
      <nav className="nav" aria-label="Main">
        {NAV.map((item) => (
          <a key={item.href} href={item.href} className={`nav-link ${active === item.match ? 'is-active' : ''}`}>
            <span className="nav-icon" aria-hidden>{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </a>
        ))}
      </nav>

      {progress.running && (
        <div className="sync-bar" role="status">
          Syncing {progress.current} ({progress.done}/{progress.total})
        </div>
      )}

      <main className="main">
        {route.name === 'dashboard' && <Dashboard />}
        {route.name === 'set' && <SetDetail setId={route.setId} variantId={route.variantId} />}
        {route.name === 'search' && <Search />}
        {route.name === 'settings' && <Settings />}
        {route.name === 'import' && <Import />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <CollectionProvider>
      <SyncProvider>
        <LibraryProvider>
          <Shell />
        </LibraryProvider>
      </SyncProvider>
    </CollectionProvider>
  )
}
