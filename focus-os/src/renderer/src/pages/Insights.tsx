import { useInsights } from '../lib/hooks'
import { InsightCard } from '../components/blocks'
import { Card, Empty, PageHeader } from '../components/ui'

export default function InsightsPage(): JSX.Element {
  const insights = useInsights()
  return (
    <div>
      <PageHeader title="Insights" subtitle="Observations computed directly from your recorded activity. If there isn't enough data for a claim, it isn't shown." />
      {insights.length ? (
        <div className="grid gap-3 lg:grid-cols-2">{insights.map((i) => <InsightCard key={i.id} i={i} />)}</div>
      ) : <Card><Empty title="Not enough data yet" hint="Insights appear once Focus OS has recorded a few minutes of activity. Nothing is estimated or invented." /></Card>}
      <Card className="card-pad mt-6">
        <div className="label mb-2">How the focus score works</div>
        <p className="text-[13px] leading-relaxed text-sub">
          Score (0–100) = 45% productive share of active time + 25% deep-work share (deep work ÷ half of active time, capped at 100%) + 15% low distraction (1 − distracting share) + 15% switch stability (1 − context switches per hour ÷ 60, floored at 0).
          Idle time is excluded. A score needs at least 5 minutes of activity. Deep work is a run of productive time of at least your configured length, tolerating short interruptions under your gap setting.
          Which activity counts as productive or distracting is decided only by the rules you can see and edit in Settings.
        </p>
      </Card>
    </div>
  )
}
