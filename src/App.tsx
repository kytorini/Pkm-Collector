import { useEffect } from 'react'
import { navigate, routeHref, useRoute } from './lib/router'
import { CollectionProvider } from './store/collection'
import { LibraryProvider, useLibrary } from './store/library'
import { Dashboard } from './views/Dashboard'
import { Import } from './views/Import'
import { Search } from './views/Search'
import { SetDetail } from './views/SetDetail'
import { SetList } from './views/SetList'
import { Settings } from './views/Settings'

const NAV = [
  { href: routeHref.dashboard, label: 'Collection', icon: '◆', match: 'dashboard' },
  { href: routeHref.sets, label: 'Sets', icon: '▦', match: 'sets' },
  { href: routeHref.search, label: 'Search', icon: '⌕', match: 'search' },
  { href: routeHref.settings, label: 'Settings', icon: '⚙', match: 'settings' },
] as const

function Shell() {
  const route = useRoute()
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

  const active = route.name === 'set' ? 'sets' : route.name === 'import' ? 'settings' : route.name

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={routeHref.dashboard}>
          <span className="brand-mark" aria-hidden>◈</span>
          <span>Pkm Collector</span>
        </a>
        <nav className="nav">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className={`nav-link ${active === item.match ? 'is-active' : ''}`}>
              <span className="nav-icon" aria-hidden>{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </a>
          ))}
        </nav>
      </header>

      {progress.running && (
        <div className="sync-bar" role="status">
          Syncing {progress.current} ({progress.done}/{progress.total})
        </div>
      )}

      <main className="main">
        {route.name === 'dashboard' && <Dashboard />}
        {route.name === 'sets' && <SetList />}
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
      <LibraryProvider>
        <Shell />
      </LibraryProvider>
    </CollectionProvider>
  )
}
