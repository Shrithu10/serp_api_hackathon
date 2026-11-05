import { useEffect } from 'react'
import { Shell } from './components/Shell'
import { useStore } from './lib/store'
import Overview from './pages/Overview'
import FocusPage from './pages/Focus'
import Timeline from './pages/Timeline'
import Applications from './pages/Applications'
import Analytics from './pages/Analytics'
import InsightsPage from './pages/Insights'
import SettingsPage from './pages/Settings'

export default function App(): JSX.Element {
  const { page, init, loaded } = useStore()
  useEffect(() => { void init() }, [init])
  if (!loaded) return <div className="grid h-full place-items-center text-[13px] text-mute">Loading…</div>
  const Page = { overview: Overview, focus: FocusPage, timeline: Timeline, applications: Applications, analytics: Analytics, insights: InsightsPage, settings: SettingsPage }[page]
  return <Shell><div key={page} className="mx-auto max-w-[1180px]"><Page /></div></Shell>
}
