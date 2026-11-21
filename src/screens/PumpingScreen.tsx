import clsx from 'clsx'
import { Fire, Lightbulb, Snowflake, Sparkle, Warning } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { myAlerts, saveAlerts } from '../components/AlertSettings'
import { LogSheet } from '../components/LogSheet'
import { Overlay } from '../components/Overlay'
import { BarChart } from '../components/charts/BarChart'
import { Panel, StatGrid } from '../components/history/bits'
import { Button, Toggle } from '../components/ui'
import { useNow } from '../hooks/useNow'
import { editEvent, startTimer, stopTimer } from '../lib/actions'
import { pumpDue, pumpPlan, type PumpDue } from '../lib/alerts'
import { photoUrl } from '../lib/photos'
import { expectedMl, pumpingCoach, pumpTarget, sitting, sittingPrompt, type Sitting, type Tip } from '../lib/pumping'
import { localReminder } from '../lib/push'
import { milkStash, pumpMl, type Lot, type Place } from '../lib/stash'
import { activeChild, useLeela } from '../lib/store'
import { sweetSpot, type SweetSpot } from '../lib/sweetspot'
import { loadAllHistory } from '../lib/sync'
import { dayStart, durationText, fmtTime } from '../lib/time'
import type { LeelaEvent } from '../lib/types'

const MIN = 60_000
const sideName = (s: 'left' | 'right' | 'both') => (s === 'both' ? 'Both sides' : s === 'left' ? 'Left side' : 'Right side')
const weekday = (t: number, tz: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(t)
const inText = (ms: number) => (ms <= MIN ? 'now' : `in ${durationText(ms)}`)

/**
 * The pumping coach, opened by the Pump button: start (and be coached through) a sitting, when each
 * side is next due with the baby's sleep in mind, today against her own usual day, the next 24
 * hours, the milk stash, and how supply is going.
 */
export function PumpingScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const family = useLeela((s) => s.family)!
  const eventsMap = useLeela((s) => s.events)
  const userId = useLeela((s) => s.userId)
  useLeela((s) => s.profiles)
  const tz = family.timezone
  const child = activeChild()
  const [sheet, setSheet] = useState<{ edit?: LeelaEvent } | null>(null)
  useEffect(() => {
    if (open) void loadAllHistory()
  }, [open])
  const all = useMemo(() => (open ? Object.values(eventsMap).filter((e) => !e.deleted_at) : []), [open, eventsMap])
  const running = all.find((e) => e.type === 'pump' && e.timer_state && e.created_by === userId)
  const now = useNow(running ? 1000 : 30_000)
  const minute = Math.floor(now / MIN)
  const events = useMemo(() => all.filter((e) => e.type === 'pump' || e.type === 'nursing' || e.type === 'bottle'), [all])
  const startOf = (t: number) => dayStart(t, tz).getTime()
  // Worked out once a minute; the sitting timer ticks on its own.
  const m = useMemo(() => {
    if (!open) return null
    const t = minute * MIN
    return {
      next: pumpDue(events as never, t, tz),
      plan: pumpPlan(events as never, t, tz),
      target: pumpTarget(events as never, t, tz, startOf),
      sit: sitting(events as never, t),
      stash: milkStash(events as never, t),
      coach: pumpingCoach(events as never, t, tz, startOf),
      spot: child ? sweetSpot(all, child, family, t) : null,
    }
  }, [open, events, all, minute, tz, child, family]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return <Overlay open={open} onClose={onClose} title="Pumping">{null}</Overlay>
  const { next, plan, target, sit, stash, coach, spot } = m
  const babyName = child?.name ?? 'Baby'

  const start = async () => {
    await startTimer('pump', child?.id ?? null)
  }
  const stop = async () => {
    if (!running) return
    await stopTimer(running.id)
    const done = useLeela.getState().events[running.id]
    if (done) setSheet({ edit: done })
  }

  return (
    <Overlay open={open} onClose={onClose} title="Pumping">
      {running ? (
        <SittingCard event={running} now={now} sit={sit} events={events} tz={tz} childId={child?.id ?? null} onStop={() => void stop()} />
      ) : (
        <StartCard next={next} now={now} sit={sit} onStart={() => void start()} onPast={() => setSheet({})} />
      )}

      {!running && next && <NextCard next={next} events={events} tz={tz} now={now} spot={spot} babyName={babyName} />}
      {target && <TargetCard t={target} tz={tz} />}
      {plan.length > 0 && <PlanCard plan={plan} spot={spot} events={events} tz={tz} now={now} babyName={babyName} />}
      <StashCard stash={stash} events={events} tz={tz} now={now} />

      <h2 className="mt-6 mb-3 px-1 font-display text-[22px] font-bold">How it’s going</h2>
      {!coach ? (
        <p className="rounded-3xl bg-card-2 px-5 py-6 text-center text-[15px] text-ink-2">Log a few pumpings with how many ml each side gave, and the coach starts learning your rhythm and yield.</p>
      ) : (
        <>
          <div className="mb-4 px-1">
            <p className="text-[14px] font-semibold text-ink-2">Last 7 days</p>
            <p className="flex items-baseline gap-2">
              <span className="num font-display text-[34px] font-extrabold leading-none">{coach.mlDay} ml</span>
              <span className="text-[16px] text-ink-2">a day</span>
              {coach.trend !== null && (
                <span className={clsx('num rounded-full px-2 py-0.5 text-[13px] font-semibold', coach.trend >= 0 ? 'bg-[var(--growth-soft)] text-[var(--growth)]' : 'bg-[var(--feed-soft)] text-[var(--feed)]')}>
                  {coach.trend >= 0 ? '+' : '−'}
                  {Math.round(Math.abs(coach.trend) * 100)}%
                </span>
              )}
            </p>
            {coach.mlDayBefore !== null && <p className="mt-1 text-[14px] text-ink-2">The week before: {coach.mlDayBefore} ml a day</p>}
          </div>

          {coach.tips.length > 0 && (
            <section className="mb-4 space-y-2" aria-label="Suggestions">
              {coach.tips.map((t) => (
                <TipCard key={t.title} t={t} />
              ))}
            </section>
          )}

          <div className="mb-4">
            <StatGrid
              stats={[
                { label: 'Pumpings a day', value: (Math.round(coach.sessionsDay * 10) / 10).toString() },
                { label: 'One side, usually', value: `${coach.perSide} ml` },
                ...(coach.minutesPerSide ? [{ label: 'Minutes a side', value: String(coach.minutesPerSide) }] : []),
                ...(coach.emptyingsDay ? [{ label: 'Emptyings a day', value: String(Math.round(coach.emptyingsDay * 10) / 10) }] : []),
                ...(coach.longestGapH ? [{ label: 'Longest stretch', value: durationText(coach.longestGapH * 3_600_000) }] : []),
                ...(coach.sides.leftN && coach.sides.rightN ? [{ label: 'Left / right', value: `${coach.sides.left} / ${coach.sides.right} ml` }] : []),
              ]}
            />
            <p className="mt-2 px-1 text-[13px] text-ink-3">Emptyings count breastfeeds and pumpings, a feed and a pump close together as one.</p>
          </div>

          <Panel title="Each day, last two weeks">
            <BarChart
              label="Millilitres pumped each day"
              days={coach.daily.map((d) => d.day)}
              tz={tz}
              average
              format={(v) => `${Math.round(v)}`}
              series={[{ key: 'ml', label: 'Pumped', color: 'var(--pump)', values: coach.daily.map((d) => d.ml) }]}
            />
          </Panel>

          {coach.blocks.length > 1 && (
            <Panel title="One side, by time of day">
              <ul className="space-y-1.5">
                {coach.blocks.map((b) => {
                  const max = Math.max(...coach.blocks.map((x) => x.ml), 1)
                  const best = coach.best?.hour === b.hour
                  return (
                    <li key={b.hour} className="flex items-center gap-3 text-[14px]">
                      <span className="w-[86px] shrink-0 text-ink-2">{b.label}</span>
                      <span className="h-3 flex-1 overflow-hidden rounded-full bg-card-2">
                        <span className="block h-full rounded-full" style={{ width: `${(b.ml / max) * 100}%`, background: 'var(--pump)', opacity: best ? 1 : 0.55 }} />
                      </span>
                      <span className={clsx('num w-[58px] shrink-0 text-right', best && 'font-bold')}>{b.ml} ml</span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 text-[13px] text-ink-3">Typical from one side, last two weeks.</p>
            </Panel>
          )}

          {coach.accuracy && (
            <p className="mb-4 rounded-2xl bg-card-2 px-4 py-3 text-[14px] leading-snug text-ink-2">
              How well “time to pump” has done: over the last two weeks, {coach.accuracy.within30} of {coach.accuracy.checked} feeds and pumpings started within half an hour of it, and it was typically {durationText(coach.accuracy.missMin * 60_000)} out. It learns from every entry.
            </p>
          )}
        </>
      )}
      <p className="px-1 text-[13px] leading-snug text-ink-3">General breastfeeding guidance, not medical advice. A lactation consultant or your doctor can tailor it to you.</p>
      {sheet && <LogSheet key={sheet.edit?.id ?? 'new'} open onClose={() => setSheet(null)} type="pump" edit={sheet.edit} />}
    </Overlay>
  )
}

// ------------------------------------------------------------------------- start
function StartCard({ next, now, sit, onStart, onPast }: { next: PumpDue | null; now: number; sit: Sitting; onStart: () => void; onPast: () => void }) {
  const alerts = myAlerts()
  const phoneOn = localReminder() !== null
  const first = next && next.other ? next : null
  return (
    <section className="mb-4 rounded-[26px] bg-[var(--pump-soft)] p-4" aria-label="Start pumping">
      <Button tone="pump" className="w-full" onClick={onStart}>
        Start pumping
      </Button>
      <p className="mt-3 text-[15px] leading-snug">
        {first ? (
          <>
            <strong className="font-semibold">Start with the {first.side} side</strong>: it was emptied longest ago ({durationText(now - first.lastAt)}).{' '}
          </>
        ) : null}
        Plan on about {sit.minutes} minutes{sit.usualMin && sit.usualMin < sit.minutes ? ` (you usually do ${sit.usualMin})` : ''}.
      </p>
      <button type="button" onClick={onPast} className="mt-1 min-h-11 text-[15px] font-semibold text-[var(--pump)]">
        Log a past session ›
      </button>
      <div className="mt-1 border-t border-line pt-2">
        <Toggle label="Tell me when it’s time to pump" checked={alerts.pump} onChange={(v) => void saveAlerts({ pump: v })} tone="pump" />
        {alerts.pump && !phoneOn && <p className="text-[13px] text-ink-2">Notifications are off on this phone: turn them on in Settings › Notifications.</p>}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------------- while pumping
function SittingCard({ event, now, sit, events, tz, childId, onStop }: { event: LeelaEvent; now: number; sit: Sitting; events: LeelaEvent[]; tz: string; childId: string | null; onStop: () => void }) {
  const ms = Math.max(0, now - Date.parse(event.started_at))
  const min = ms / MIN
  const pct = Math.min(1, min / sit.minutes)
  const left = expectedMl(events as never, 'left', now, tz, now)
  const right = expectedMl(events as never, 'right', now, tz, now)
  const photo = useBabyPhoto(childId)
  const mm = Math.floor(ms / MIN)
  const ss = Math.floor((ms % MIN) / 1000)
  return (
    <section className="mb-4 rounded-[26px] bg-[var(--pump-soft)] p-4" aria-label="Pumping now">
      <div className="flex items-center gap-4">
        {photo && <img src={photo} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />}
        <div className="min-w-0">
          <p className="text-[13px] font-bold tracking-wide text-[var(--pump)] uppercase">Pumping</p>
          <p className="num font-display text-[46px] font-extrabold leading-none" aria-live="off">
            {mm}:{String(ss).padStart(2, '0')}
          </p>
          <p className="text-[14px] text-ink-2">of about {sit.minutes} min</p>
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-card" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label="Through your usual length">
        <span className="block h-full rounded-full bg-[var(--pump)] transition-[width]" style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="mt-3 min-h-[44px] text-[16px] leading-snug">{sittingPrompt(min, sit)}</p>
      {(left || right) && (
        <p className="mt-1 text-[14px] text-ink-2">
          Usually now: {[left && `left ~${left} ml`, right && `right ~${right} ml`].filter(Boolean).join(', ')}
        </p>
      )}
      <Button tone="pump" className="mt-3 w-full" onClick={onStop}>
        Stop and add the amount
      </Button>
    </section>
  )
}

/** The newest photo of the baby, to help the milk let down. */
function useBabyPhoto(childId: string | null): string | null {
  const eventsMap = useLeela((s) => s.events)
  const path = useMemo(() => {
    let best: LeelaEvent | undefined
    for (const e of Object.values(eventsMap)) {
      if (e.deleted_at || !e.photo_paths?.length || (childId && e.child_id && e.child_id !== childId)) continue
      if (!best || e.started_at > best.started_at) best = e
    }
    return best?.photo_paths[0] ?? null
  }, [eventsMap, childId])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (path) void photoUrl(path).then((u) => alive && setUrl(u))
    else setUrl(null)
    return () => {
      alive = false
    }
  }, [path])
  return url
}

// ------------------------------------------------------------------------- next
/** One line on the next pumping and the baby's sleep or feed. */
function aroundBaby(x: Omit<PumpDue, 'other'>, spot: SweetSpot | null, tz: string, now: number, name: string): string | null {
  if (!spot) return null
  const due = Math.max(now, x.dueAt)
  if ((spot.status === 'napping' || spot.status === 'night') && spot.wakeAround) {
    if (due <= spot.wakeAround - 20 * MIN) return `${name} is likely asleep until about ${fmtTime(spot.wakeAround, tz)}: a calm time to pump.`
    return `${name} will likely wake about ${fmtTime(spot.wakeAround, tz)}. A feed on the ${x.side} side then counts as emptying it.`
  }
  const w = spot.next
  if (w && !w.resettle && due >= w.start - 30 * MIN && due <= w.end + 60 * MIN)
    return `Her ${w.kind === 'bedtime' ? 'bedtime' : 'nap'} sweet spot is about ${fmtTime(w.center, tz)}: pump once she’s down.`
  if (spot.feed && Math.abs(spot.feed.at - due) <= 40 * MIN) return `A feed is likely about ${fmtTime(spot.feed.at, tz)}. Feeding from the ${x.side} side then counts as emptying it.`
  return null
}

function NextCard({ next, events, tz, now, spot, babyName }: { next: PumpDue; events: LeelaEvent[]; tz: string; now: number; spot: SweetSpot | null; babyName: string }) {
  const row = (x: Omit<PumpDue, 'other'>, named: boolean, main: boolean) => {
    const ml = expectedMl(events as never, x.side, Math.max(now, x.dueAt), tz, now)
    const late = now - x.dueAt
    const when = late > 10 * MIN ? `due since ${fmtTime(x.dueAt, tz)}` : late >= -MIN ? 'due now' : `${fmtTime(x.dueAt - 15 * MIN, tz)} – ${fmtTime(x.dueAt + 30 * MIN, tz)}`
    const note = main ? aroundBaby(x, spot, tz, now, babyName) : null
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0">
            <span className={clsx('block font-bold', main ? 'text-[19px]' : 'text-[16px]')}>
              {named ? sideName(x.side) : 'Next'}: {when}
            </span>
            <span className="block text-[13px] text-ink-2">
              {late < -MIN ? `${inText(-late)} · ` : ''}last emptied {fmtTime(x.lastAt, tz)} by {x.lastKind === 'pump' ? 'pumping' : 'a feed'}
              {x.basis === 'logs' ? `, usually ${durationText(x.everyMin * MIN)} apart around then` : ''}
            </span>
          </span>
          {ml !== null && <span className="num shrink-0 text-[15px] font-semibold">~{ml} ml</span>}
        </div>
        {note && <p className="mt-1.5 text-[14px] leading-snug">{note}</p>}
      </div>
    )
  }
  return (
    <section className="mb-4 space-y-3 rounded-[26px] bg-card p-4 shadow-lift" aria-label="Next pumping">
      <p className="text-[13px] font-bold tracking-wide text-[var(--pump)] uppercase">Best time to pump</p>
      {row(next, Boolean(next.other), true)}
      {next.other && row(next.other, true, false)}
    </section>
  )
}

// ------------------------------------------------------------------------- today
function TargetCard({ t, tz }: { t: NonNullable<ReturnType<typeof pumpTarget>>; tz: string }) {
  const pct = Math.min(1, t.today / t.target)
  const r = 34
  const c = 2 * Math.PI * r
  const ahead = t.today - t.byNow
  const pace = t.hitToday
    ? t.today >= t.target
      ? 'Your usual day, reached. Lovely work.'
      : 'Nearly your usual day: one more session gets you there.'
    : t.byNow > 0
      ? ahead >= 0
        ? `Ahead of your usual pace (about ${t.byNow} ml by now).`
        : `About ${-ahead} ml behind your usual pace for now; the next session catches up.`
      : 'A fresh day: every session counts.'
  return (
    <section className="mb-4 flex items-center gap-4 rounded-[26px] bg-card p-4 shadow-lift" aria-label="Today">
      <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0" aria-hidden="true">
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--card-2)" strokeWidth="9" />
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--pump)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 42 42)" />
        <text x="42" y="47" textAnchor="middle" className="num" style={{ fontSize: 17, fontWeight: 800, fill: 'var(--ink)' }}>
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-[13px] font-bold tracking-wide text-[var(--pump)] uppercase">Today</p>
        <p className="num text-[22px] font-extrabold leading-tight">
          {t.today} <span className="text-[16px] font-semibold text-ink-2">of {t.target} ml</span>
        </p>
        <p className="text-[14px] leading-snug text-ink-2">{pace}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-ink-2">
          {t.streak > 0 && (
            <span className="flex items-center gap-1 font-semibold text-[var(--feed)]">
              <Fire size={15} weight="fill" aria-hidden="true" /> {t.streak} {t.streak === 1 ? 'day' : 'days'} in a row
            </span>
          )}
          {t.best && (
            <span>
              Best: {t.best.ml} ml ({weekday(t.best.day, tz)} {new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: tz }).format(t.best.day)})
            </span>
          )}
        </p>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------------- next 24 hours
function PlanCard({ plan, spot, events, tz, now, babyName }: { plan: { side: 'left' | 'right' | 'both'; at: number }[]; spot: SweetSpot | null; events: LeelaEvent[]; tz: string; now: number; babyName: string }) {
  const until = now + 24 * 3_600_000
  type Row = { at: number; kind: 'pump' | 'baby'; text: string; ml?: number | null }
  const rows: Row[] = plan.map((p) => {
    const ml = p.side === 'both' ? (expectedMl(events as never, 'left', p.at, tz, now) ?? 0) + (expectedMl(events as never, 'right', p.at, tz, now) ?? 0) || null : expectedMl(events as never, p.side, p.at, tz, now)
    return { at: p.at, kind: 'pump', text: sideName(p.side), ml }
  })
  if (spot) {
    if ((spot.status === 'napping' || spot.status === 'night') && spot.wakeAround) rows.push({ at: spot.wakeAround, kind: 'baby', text: `${babyName} likely wakes` })
    for (const w of [...(spot.next && !spot.next.resettle ? [spot.next] : []), ...spot.later]) {
      if (w.center <= until) rows.push({ at: w.center, kind: 'baby', text: `${babyName}’s ${w.kind === 'bedtime' ? 'bedtime' : 'nap'}` })
    }
  }
  rows.sort((a, b) => a.at - b.at)
  return (
    <Panel title="Next 24 hours">
      <ol className="space-y-1">
        {rows.slice(0, 14).map((r, i) => (
          <li key={i} className={clsx('flex items-center gap-3 rounded-xl px-2 py-1.5 text-[15px]', r.kind === 'pump' ? '' : 'text-ink-2')}>
            <span className="num w-[72px] shrink-0 font-semibold">{r.at <= now + MIN ? 'Now' : fmtTime(r.at, tz)}</span>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.kind === 'pump' ? 'var(--pump)' : 'var(--sleep)' }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{r.text}</span>
            {r.ml ? <span className="num shrink-0 text-ink-2">~{r.ml} ml</span> : null}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[13px] text-ink-3">If each side is emptied when it’s due. A breastfeed counts too, and the plan moves with every entry.</p>
    </Panel>
  )
}

// ------------------------------------------------------------------------- milk stash
function StashCard({ stash, events, tz, now }: { stash: ReturnType<typeof milkStash>; events: LeelaEvent[]; tz: string; now: number }) {
  const unsorted = events
    .filter((e) => e.type === 'pump' && !e.timer_state && e.data.stash === undefined && pumpMl(e as never) > 0 && Date.parse(e.started_at) > now - 24 * 3_600_000)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 3)
  const put = (e: LeelaEvent, place: Place | 'fed') => void editEvent(e.id, { data: { ...e.data, stash: place } }, { base: e.updated_at })
  const gone = (id: string) => {
    const e = useLeela.getState().events[id]
    if (e) void editEvent(id, { data: { ...e.data, stash_gone_at: new Date().toISOString() } }, { base: e.updated_at })
  }
  const toFreezer = (id: string) => {
    const e = useLeela.getState().events[id]
    if (e) void editEvent(id, { data: { ...e.data, stash: 'freezer' } }, { base: e.updated_at })
  }
  const empty = !stash.lots.length
  return (
    <Panel title="Milk stash">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-card-2 px-3 py-2.5">
          <p className="text-[13px] font-semibold text-ink-2">Fridge</p>
          <p className="num text-[24px] font-bold leading-tight">{stash.fridgeMl} ml</p>
        </div>
        <div className="rounded-2xl bg-card-2 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[13px] font-semibold text-ink-2">
            <Snowflake size={14} weight="bold" aria-hidden="true" /> Freezer
          </p>
          <p className="num text-[24px] font-bold leading-tight">{stash.freezerMl} ml</p>
        </div>
      </div>

      {unsorted.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-[14px] font-semibold">Where did this milk go?</p>
          {unsorted.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 text-[14px]">
              <span className="num mr-auto">
                {fmtTime(e.started_at, tz)} · {pumpMl(e as never)} ml
              </span>
              {(['fridge', 'freezer', 'fed'] as const).map((p) => (
                <button key={p} type="button" onClick={() => put(e, p)} className="min-h-10 rounded-full bg-card-2 px-3.5 font-semibold ring-1 ring-line">
                  {p === 'fridge' ? 'Fridge' : p === 'freezer' ? 'Freezer' : 'Fed'}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {stash.lots.length > 0 && (
        <ul className="mb-2 space-y-2">
          {stash.lots.slice(0, 8).map((l) => (
            <LotRow key={l.id} l={l} tz={tz} now={now} onGone={() => gone(l.id)} onFreeze={() => toFreezer(l.id)} />
          ))}
        </ul>
      )}
      {stash.usedWeek.bottles > 0 && (
        <p className="mb-2 text-[14px] text-ink-2">
          Last 7 days: {stash.usedWeek.bottles} {stash.usedWeek.bottles === 1 ? 'bottle' : 'bottles'} ({stash.usedWeek.ml} ml) from the stash.
        </p>
      )}
      <p className="text-[13px] leading-snug text-ink-3">
        {empty ? 'After pumping, choose Fridge or Freezer and the milk is counted here; breast-milk bottles take from it, oldest first. ' : ''}
        Fridge up to 4 days, freezer best within 6 months. Thaw in the fridge, use thawed milk within a day and never refreeze it.
      </p>
    </Panel>
  )
}

function LotRow({ l, tz, now, onGone, onFreeze }: { l: Lot; tz: string; now: number; onGone: () => void; onFreeze: () => void }) {
  const past = l.useBy <= now
  const soon = !past && l.useBy - now < 24 * 3_600_000
  return (
    <li className={clsx('rounded-2xl px-3 py-2.5', past ? 'bg-[var(--feed-soft)]' : 'bg-card-2')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-[16px] font-bold">
          {l.left} ml{l.left < l.ml ? <span className="font-normal text-ink-2"> of {l.ml}</span> : null}
        </span>
        <span className={clsx('text-[13px]', past || soon ? 'font-semibold text-[var(--feed)]' : 'text-ink-2')}>
          {past ? 'Past its 4 days' : `Use by ${weekday(l.useBy, tz)} ${l.place === 'fridge' ? fmtTime(l.useBy, tz) : new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: tz }).format(l.useBy)}`}
        </span>
      </div>
      <p className="text-[13px] text-ink-2">
        {l.place === 'fridge' ? 'Fridge' : 'Freezer'}, pumped {weekday(l.at, tz)} {fmtTime(l.at, tz)}
      </p>
      <div className="mt-1.5 flex gap-2">
        {l.place === 'fridge' && !past && (
          <button type="button" onClick={onFreeze} className="min-h-9 rounded-full bg-card px-3 text-[14px] font-semibold">
            Move to freezer
          </button>
        )}
        <button type="button" onClick={onGone} className="min-h-9 rounded-full bg-card px-3 text-[14px] font-semibold">
          {past ? 'Thrown away' : 'Used or gone'}
        </button>
      </div>
    </li>
  )
}

function TipCard({ t }: { t: Tip }) {
  const Icon = t.kind === 'good' ? Sparkle : t.kind === 'watch' ? Warning : Lightbulb
  const tone = t.kind === 'good' ? 'growth' : t.kind === 'watch' ? 'feed' : 'pump'
  return (
    <div className="flex gap-3 rounded-2xl bg-card px-4 py-3">
      <Icon size={22} weight="duotone" className="mt-0.5 shrink-0" style={{ color: `var(--${tone})` }} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[16px] font-semibold leading-snug">{t.title}</p>
        <p className="mt-0.5 text-[14px] leading-snug text-ink-2">{t.text}</p>
      </div>
    </div>
  )
}
