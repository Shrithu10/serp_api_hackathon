import { useMemo, useState } from 'react'
import { timelineBlocks } from '@shared/metrics'
import { addDays, fmtDay, fmtDuration, fmtHM, startOfDay } from '@shared/time'
import type { Category } from '@shared/types'
import { useDay } from '../lib/hooks'
import { useStore } from '../lib/store'
import { CAT_COLOR, IDLE_COLOR } from '../lib/ui'
import { CAT_LEGEND, HourlyChart, TimelineStrip } from '../components/blocks'
import { Icon } from '../components/Icon'
import { AppAvatar, CatChip, Card, Empty, Legend, PageHeader, Segmented } from '../components/ui'

export default function Timeline(): JSX.Element {
  const { segments, classify, now } = useStore()
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState<'all' | Category>('all')
  const dayStart = addDays(startOfDay(now), offset)
  const stats = useDay(dayStart)
  const blocks = useMemo(() => timelineBlocks(segments, classify, dayStart, addDays(dayStart, 1)), [segments, classify, dayStart])
  const from = stats.firstTs ? Math.floor((stats.firstTs - 10 * 60_000) / 3_600_000) * 3_600_000 : dayStart + 8 * 3_600_000
  const to = stats.lastTs ? Math.max(from + 4 * 3_600_000, Math.ceil(stats.lastTs / 3_600_000) * 3_600_000) : from + 10 * 3_600_000
  // list: hide sub-10s noise, apply filter
  const list = blocks.filter((b) => b.end - b.start >= 10_000 && (filter === 'all' || (!b.idle && b.category === filter)))
  return (
    <div>
      <PageHeader title="Activity Timeline" subtitle="Everything you did, in order. Colours show how each activity is classified.">
        <button className="btn px-2" onClick={() => setOffset(offset - 1)} aria-label="Previous day"><Icon name="chevL" /></button>
        <div className="min-w-[150px] text-center text-[13px] font-medium">{offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : fmtDay(dayStart)}</div>
        <button className="btn px-2" disabled={offset >= 0} onClick={() => setOffset(offset + 1)} aria-label="Next day"><Icon name="chevR" /></button>
      </PageHeader>
      {!blocks.length ? (
        <Card><Empty title="No activity recorded for this day" hint="Pick another day, or load demo data from Settings → Data & privacy." /></Card>
      ) : (
        <div className="space-y-4">
          <Card className="card-pad">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Legend items={[...CAT_LEGEND, { label: 'Idle', color: IDLE_COLOR }]} />
              <div className="text-[12px] text-sub">{fmtDuration(stats.activeMs, { short: true })} active · {fmtDuration(stats.idleMs, { short: true })} idle · {stats.appSwitches} switches</div>
            </div>
            <TimelineStrip blocks={blocks} from={from} to={to} height={56} />
          </Card>
          <Card className="card-pad"><div className="label mb-3">Hourly breakdown</div><HourlyChart day={stats} from={Math.max(0, new Date(from).getHours())} to={Math.min(23, new Date(to - 1).getHours())} height={190} /></Card>
          <Card>
            <div className="flex items-center justify-between px-5 pt-4">
              <div className="label">Chronology</div>
              <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'productive', label: 'Productive' }, { value: 'neutral', label: 'Neutral' }, { value: 'distracting', label: 'Distracting' }]} />
            </div>
            <div className="mt-3 divide-y divide-line">
              {list.slice().reverse().map((b, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-2.5 text-[13px] transition hover:bg-hover">
                  <span className="tabular w-[118px] shrink-0 text-[12px] text-mute">{fmtHM(b.start)} – {fmtHM(b.end)}</span>
                  <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: b.idle ? IDLE_COLOR : CAT_COLOR[b.category] }} />
                  {b.idle ? <span className="text-sub">Idle</span> : <><AppAvatar name={b.appName} size={22} /><div className="min-w-0 flex-1"><div className="truncate">{b.entity !== b.appName ? `${b.entity} · ${b.appName}` : b.appName}</div>{b.title && <div className="truncate text-[11px] text-mute">{b.title}</div>}</div></>}
                  {b.idle && <span className="flex-1" />}
                  {!b.idle && <CatChip cat={b.category} />}
                  <span className="tabular w-16 shrink-0 text-right text-sub">{fmtDuration(b.end - b.start, { short: true })}</span>
                </div>
              ))}
              {!list.length && <div className="p-8 text-center text-[13px] text-mute">Nothing matches this filter.</div>}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
