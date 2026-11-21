import clsx from 'clsx'
import { CalendarBlank } from '@phosphor-icons/react'
import { useState } from 'react'
import { customPeriod, lifeMonths, makePeriod, periodLabel, rangeText, startOf, type Period, type PeriodKind } from '../../lib/period'
import { addDaysTz, dayKey } from '../../lib/time'
import { TZDate } from '@date-fns/tz'
import { Sheet } from '../Sheet'
import { Button } from '../ui'

const KINDS: { id: Exclude<PeriodKind, 'custom' | 'month'>; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'fortnight', label: 'Fortnight' },
  { id: 'days30', label: 'Month' },
  { id: 'days90', label: '90 days' },
  { id: 'all', label: 'All time' },
]

const fromInput = (v: string, tz: string) => {
  const [y, m, d] = v.split('-').map(Number)
  return new TZDate(y, m - 1, d, tz).getTime()
}

/**
 * Day · Week · Fortnight · Month · 90 days · All time. On Day, a row of dates to tap (newest
 * first, then "Earlier" for any day); on the others, the dates shown and "Other dates" for any
 * day, month of life, calendar month or your own range.
 */
export function PeriodBar({
  period,
  onChange,
  tz,
  now,
  start,
  birth,
  kinds = KINDS.map((k) => k.id),
}: {
  period: Period
  onChange: (p: Period) => void
  tz: string
  now: number
  /** First day there could be anything to show (birth). */
  start: number
  birth: string | null
  kinds?: PeriodKind[]
}) {
  const [picking, setPicking] = useState(false)
  const label = periodLabel(period, tz, now, { birth: Boolean(birth) })
  const last = Math.min(now, addDaysTz(period.to, -1, tz).getTime())
  const sub = period.kind === 'day' ? (label === 'Today' || label === 'Yesterday' ? new TZDate(period.from, tz).toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }) : null) : rangeText(Math.max(period.from, start), last, tz)
  const today = startOf(now, tz)
  const dates: number[] = []
  for (let d = today, i = 0; d >= start && i < 31; d = addDaysTz(d, -1, tz).getTime(), i++) dates.push(d)
  const picked = period.kind === 'day' ? period.from : null

  return (
    <div className="mb-4">
      <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1" role="tablist" aria-label="How much to show">
        {KINDS.filter((k) => kinds.includes(k.id)).map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={period.kind === k.id}
            onClick={() => onChange(makePeriod(k.id, now, tz, start, now))}
            className={clsx('h-10 shrink-0 rounded-full px-4 text-[15px] font-semibold', period.kind === k.id ? 'bg-brand text-brand-ink' : 'bg-card text-ink-2 ring-1 ring-line')}
          >
            {k.label}
          </button>
        ))}
      </div>

      {period.kind === 'day' && kinds.includes('day') && (
        <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist" aria-label="Choose a day">
          {dates.map((d) => {
            const on = d === picked
            const t = new TZDate(d, tz)
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onChange(makePeriod('day', d, tz, start, now))}
                className={clsx('flex h-[64px] w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl', on ? 'bg-brand text-brand-ink' : 'bg-card')}
              >
                <span className="text-[12px] font-semibold opacity-80">{d === today ? 'Today' : t.toLocaleDateString('en', { weekday: 'short', timeZone: tz })}</span>
                <span className="num text-[21px] font-bold leading-none">{t.getDate()}</span>
              </button>
            )
          })}
          <button type="button" onClick={() => setPicking(true)} className="flex h-[64px] w-[58px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-card text-ink-2" aria-label="Pick an earlier day">
            <CalendarBlank size={20} weight="bold" aria-hidden="true" />
            <span className="text-[11px] font-semibold">Earlier</span>
          </button>
        </div>
      )}

      <div className="mt-2 flex items-baseline justify-between gap-3 px-1">
        <span className="min-w-0">
          <span className="block truncate font-display text-[19px] font-bold leading-tight">{label}</span>
          {sub && <span className="block truncate text-[13px] text-ink-2">{sub}</span>}
        </span>
        {period.kind !== 'day' && (
          <button type="button" onClick={() => setPicking(true)} className="min-h-10 shrink-0 text-[14px] font-semibold text-brand">
            Other dates
          </button>
        )}
      </div>
      <PeriodSheet
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false)
          onChange(p)
        }}
        period={period}
        tz={tz}
        now={now}
        start={start}
        birth={birth}
      />
    </div>
  )
}

function PeriodSheet({ open, onClose, onPick, period, tz, now, start, birth }: { open: boolean; onClose: () => void; onPick: (p: Period) => void; period: Period; tz: string; now: number; start: number; birth: string | null }) {
  const today = dayKey(now, tz)
  const min = dayKey(start, tz)
  const [from, setFrom] = useState(() => dayKey(period.from, tz))
  const [to, setTo] = useState(() => dayKey(Math.min(now, period.to - 1), tz))
  const months = birth ? lifeMonths(birth, tz, now) : []
  const calendar: Period[] = []
  for (let p = makePeriod('month', now, tz, start, now); p.to > start && calendar.length < 24; p = { ...p, ...prevMonth(p, tz) }) calendar.push(p)
  const quick: { label: string; p: Period }[] = [
    { label: 'Today', p: makePeriod('day', now, tz, start, now) },
    { label: 'Last 7 days', p: makePeriod('week', now, tz, start, now) },
    { label: 'Last 14 days', p: makePeriod('fortnight', now, tz, start, now) },
    { label: 'Last 30 days', p: makePeriod('days30', now, tz, start, now) },
    { label: 'Last 90 days', p: makePeriod('days90', now, tz, start, now) },
    { label: birth ? 'Since birth' : 'Everything', p: makePeriod('all', now, tz, start, now) },
  ]
  const chip = 'min-h-11 rounded-full bg-card-2 px-4 text-[15px] font-semibold ring-1 ring-line active:bg-card'

  return (
    <Sheet open={open} onClose={onClose} title="Choose dates">
      <h3 className="mb-2 text-[15px] font-semibold text-ink-2">Quick picks</h3>
      <div className="mb-5 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button key={q.label} type="button" className={chip} onClick={() => onPick(q.p)}>
            {q.label}
          </button>
        ))}
      </div>

      <label className="mb-5 block">
        <span className="mb-2 block text-[15px] font-semibold text-ink-2">A particular day</span>
        <input
          type="date"
          min={min}
          max={today}
          className="h-13 w-full rounded-2xl border border-line bg-card-2 px-4 text-[17px]"
          onChange={(e) => e.target.value && onPick(makePeriod('day', fromInput(e.target.value, tz), tz, start, now))}
        />
      </label>

      {months.length > 1 && (
        <>
          <h3 className="mb-2 text-[15px] font-semibold text-ink-2">Month of life</h3>
          <div className="mb-5 flex flex-wrap gap-2">
            {months.map((m) => (
              <button key={m.n} type="button" className={chip} onClick={() => onPick(m.period)}>
                Month {m.n} <span className="font-normal text-ink-2">· {rangeText(m.period.from, Math.min(now, addDaysTz(m.period.to, -1, tz).getTime()), tz)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {calendar.length > 1 && (
        <>
          <h3 className="mb-2 text-[15px] font-semibold text-ink-2">Calendar month</h3>
          <div className="mb-5 flex flex-wrap gap-2">
            {calendar.map((p) => (
              <button key={p.from} type="button" className={chip} onClick={() => onPick(p)}>
                {new TZDate(p.from, tz).toLocaleDateString('en', { month: 'long', year: new TZDate(p.from, tz).getFullYear() === new TZDate(now, tz).getFullYear() ? undefined : 'numeric', timeZone: tz })}
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="mb-2 text-[15px] font-semibold text-ink-2">Your own dates</h3>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-[13px] text-ink-2">From</span>
          <input type="date" value={from} min={min} max={today} onChange={(e) => setFrom(e.target.value)} className="h-13 w-full rounded-2xl border border-line bg-card-2 px-3 text-[16px]" />
        </label>
        <label>
          <span className="mb-1 block text-[13px] text-ink-2">To</span>
          <input type="date" value={to} min={min} max={today} onChange={(e) => setTo(e.target.value)} className="h-13 w-full rounded-2xl border border-line bg-card-2 px-3 text-[16px]" />
        </label>
      </div>
      <Button className="mb-2 w-full" disabled={!from || !to} onClick={() => onPick(customPeriod(fromInput(from, tz), fromInput(to, tz), tz))}>
        Show these dates
      </Button>
    </Sheet>
  )
}

function prevMonth(p: Period, tz: string): Period {
  const d = new TZDate(p.from, tz)
  return { kind: 'month', from: new TZDate(d.getFullYear(), d.getMonth() - 1, 1, tz).getTime(), to: p.from }
}
