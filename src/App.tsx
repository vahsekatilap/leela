import { Suspense, lazy, useEffect, useState } from 'react'
import { ConflictDialog } from './components/ConflictDialog'
import { LeelaMark } from './components/LeelaMark'
import { NoteEditor } from './components/NoteEditor'
import { TabBar } from './components/TabBar'
import { Toasts } from './components/Toasts'
import { useLeela } from './lib/store'
import { applyTheme } from './lib/theme'
import { AuthScreen } from './screens/AuthScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { TodayScreen } from './screens/TodayScreen'
import { myPrefs } from './lib/store'

// Today loads with the app; everything else loads when first needed (and quietly soon after start),
// so the app opens faster.
const screens = {
  history: () => import('./screens/HistoryScreen'),
  notes: () => import('./screens/NotesScreen'),
  diary: () => import('./screens/DiaryScreen'),
  family: () => import('./screens/FamilyScreen'),
  book: () => import('./screens/BookScreen'),
  import: () => import('./screens/ImportScreen'),
  vaccines: () => import('./screens/VaccinesScreen'),
  report: () => import('./screens/ReportScreen'),
  admin: () => import('./screens/AdminScreen'),
  pumping: () => import('./screens/PumpingScreen'),
  solids: () => import('./screens/SolidsScreen'),
}
const HistoryScreen = lazy(() => screens.history().then((m) => ({ default: m.HistoryScreen })))
const NotesScreen = lazy(() => screens.notes().then((m) => ({ default: m.NotesScreen })))
const DiaryScreen = lazy(() => screens.diary().then((m) => ({ default: m.DiaryScreen })))
const FamilyScreen = lazy(() => screens.family().then((m) => ({ default: m.FamilyScreen })))
const BookScreen = lazy(() => screens.book().then((m) => ({ default: m.BookScreen })))
const ImportScreen = lazy(() => screens.import().then((m) => ({ default: m.ImportScreen })))
const VaccinesScreen = lazy(() => screens.vaccines().then((m) => ({ default: m.VaccinesScreen })))
const ReportScreen = lazy(() => screens.report().then((m) => ({ default: m.ReportScreen })))
const AdminScreen = lazy(() => screens.admin().then((m) => ({ default: m.AdminScreen })))
const PumpingScreen = lazy(() => screens.pumping().then((m) => ({ default: m.PumpingScreen })))
const SolidsScreen = lazy(() => screens.solids().then((m) => ({ default: m.SolidsScreen })))

/** Mounts a full screen the first time it's opened, then keeps it (so it can animate closed). */
function Later({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [seen, setSeen] = useState(open)
  useEffect(() => {
    if (open) setSeen(true)
  }, [open])
  return seen || open ? <Suspense fallback={null}>{children}</Suspense> : null
}

const Loading = () => (
  <div className="grid min-h-[60dvh] place-items-center" aria-busy="true" aria-label="Loading">
    <LeelaMark className="h-10 w-10 animate-pulse opacity-60" />
  </div>
)

export function App() {
  const status = useLeela((s) => s.status)
  const onboarding = useLeela((s) => s.onboarding)
  const tab = useLeela((s) => s.tab)
  const family = useLeela((s) => s.family)
  const overlay = useLeela((s) => s.overlay)
  const closeOverlay = () => useLeela.getState().set({ overlay: null })

  // A tapped notification can ask for a screen: ?open=vaccines in a new window, or a message from
  // the service worker when Leela was already open (public/push-sw.js).
  const ready = status === 'ready' && Boolean(family) && !onboarding
  useEffect(() => {
    if (!ready) return
    const go = (what: unknown) => {
      if (what === 'vaccines') useLeela.getState().set({ tab: 'today', overlay: { kind: 'vaccines' } })
      else if (what === 'today') useLeela.getState().set({ tab: 'today' })
    }
    const url = new URL(window.location.href)
    const asked = url.searchParams.get('open')
    if (asked) {
      go(asked)
      url.searchParams.delete('open')
      window.history.replaceState(window.history.state, '', url.toString())
    }
    const onMessage = (e: MessageEvent) => go((e.data as { leelaOpen?: unknown } | null)?.leelaOpen)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [ready])

  // Fetch the other screens in the background a few seconds after opening.
  useEffect(() => {
    if (!ready) return
    const t = window.setTimeout(() => {
      for (const k of ['history', 'diary', 'notes', 'family', 'pumping', 'vaccines'] as const) void screens[k]()
    }, 3000)
    return () => window.clearTimeout(t)
  }, [ready])

  useEffect(() => {
    applyTheme(family)
    const t = window.setInterval(() => applyTheme(useLeela.getState().family), 60_000)
    return () => window.clearInterval(t)
  }, [family])

  let screen: React.ReactNode
  if (status === 'loading') {
    screen = (
      <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading LAPdiary">
        <LeelaMark className="h-16 w-16 animate-pulse" />
      </div>
    )
  } else if (status === 'signed_out') {
    screen = <AuthScreen />
  } else if (status === 'no_family' || onboarding || !family) {
    screen = <OnboardingScreen />
  } else {
    screen = (
      <>
        <main>
          {tab === 'today' && <TodayScreen />}
          <Suspense fallback={<Loading />}>
            {tab === 'history' && <HistoryScreen />}
            {tab === 'notes' && <NotesScreen />}
            {tab === 'diary' && <DiaryScreen />}
            {tab === 'family' && <FamilyScreen />}
          </Suspense>
        </main>
        <TabBar />
        <ConflictDialog />
        <Later open={overlay?.kind === 'import'}>
          <ImportScreen open={overlay?.kind === 'import'} onClose={closeOverlay} />
        </Later>
        <NoteEditor open={overlay?.kind === 'note'} noteId={overlay?.kind === 'note' ? overlay.id : undefined} onClose={closeOverlay} />
        <Later open={overlay?.kind === 'book'}>
          <BookScreen open={overlay?.kind === 'book'} onClose={closeOverlay} />
        </Later>
        <Later open={overlay?.kind === 'vaccines'}>
          <VaccinesScreen open={overlay?.kind === 'vaccines'} onClose={closeOverlay} />
        </Later>
        <Later open={overlay?.kind === 'pumping'}>
          <PumpingScreen open={overlay?.kind === 'pumping'} onClose={closeOverlay} />
        </Later>
        <Later open={overlay?.kind === 'solids'}>
          <SolidsScreen open={overlay?.kind === 'solids'} onClose={closeOverlay} />
        </Later>
        <Later open={overlay?.kind === 'report'}>
          <ReportScreen open={overlay?.kind === 'report'} onClose={closeOverlay} />
        </Later>
        {myPrefs().admin === true && (
          <Later open={overlay?.kind === 'admin'}>
            <AdminScreen open={overlay?.kind === 'admin'} onClose={closeOverlay} />
          </Later>
        )}
      </>
    )
  }

  return (
    <>
      {screen}
      <Toasts />
    </>
  )
}
