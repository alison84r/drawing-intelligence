import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { AppShell } from '@/components/layout/AppShell'
import { LibraryScreen } from '@/components/library/LibraryScreen'
import { useSessionStore } from '@/store/sessionStore'

export default function App() {
  const screen = useSessionStore((s) => s.screen)
  return <ThemeProvider>{screen === 'library' ? <LibraryScreen /> : <AppShell />}</ThemeProvider>
}
