// The pumping coach: how much each side gives and when, how supply is trending, how often the
// breasts are emptied and the longest stretches, set against common breastfeeding guidance, with
// suggestions that follow from the mother's own numbers. No libraries.
import { localMinute, pumpDue, sideSessions } from './alerts'
export { expectedMl, sideSessions, type SideSession } from './alerts'

const MIN = 60_000
const H = 3_600_000
const DAY = 24 * H

interface Ev {
  id: string
  type: string
  child_id: string | null
  started_at: string
  ended_at: string | null
  timer_state: string | null
  deleted_at: string | null
  data: Record<string, unknown>
}

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export interface Block {
  /** Start hour of the three-hour block. */
  hour: number
  label: string
  /** Typical millilitres from one side at this time. */
  ml: number
  n: number
}

export interface Tip {
  kind: 'good' | 'idea' | 'watch'
  title: string
  text: string
}

export interface Coach {
  /** Pumped a day, last 7 days and the 7 before (days with any pumping). */
  mlDay: number
  mlDayBefore: number | null
  /** Change in a day's pumping against the week before, as a fraction. */
  trend: number | null
  sessionsDay: number
  /** Typical millilitres from one side at one sitting. */
  perSide: number
  /** Typical minutes per side. */
  minutesPerSide: number
  sides: { left: number; right: number; leftN: number; rightN: number }
  blocks: Block[]
  best: Block | null
  /** Times each breast is emptied in a day (breastfeeds and pumping), on average. */
  emptyingsDay: number
  /** Typical longest stretch without emptying either breast, hours. */
  longestGapH: number
  /** When the longest stretch usually starts, minutes after midnight. */
  longestGapAt: number | null
  /** Daily totals for the last 14 days, oldest first (0 where nothing was pumped). */
  daily: { day: number; ml: number }[]
  tips: Tip[]
  /** How close "time to pump" came to when pumping really started, last two weeks. */
  accuracy: { checked: number; within30: number; missMin: number } | null
}

const blockLabel = (h: number) => {
  const f = (x: number) => `${((x + 11) % 12) + 1}${x % 24 < 12 ? 'am' : 'pm'}`
  return `${f(h)}–${f((h + 3) % 24)}`
}

/** Emptyings of either breast (breastfeeds and pumping, merged when within 45 minutes). */
function emptyings(events: Ev[]): { start: number; end: number }[] {
  const all = events
    .filter((e) => !e.deleted_at && !e.timer_state && (e.type === 'nursing' || e.type === 'pump'))
    .map((e) => ({ start: Date.parse(e.started_at), end: e.ended_at ? Date.parse(e.ended_at) : Date.parse(e.started_at) }))
    .sort((a, b) => a.start - b.start)
  const out: { start: number; end: number }[] = []
  for (const x of all) {
    const last = out[out.length - 1]
    if (last && x.start - last.end < 45 * MIN) last.end = Math.max(last.end, x.end)
    else out.push({ ...x })
  }
  return out
}

export function pumpingCoach(events: Ev[], now: number, tz: string, startOfDay: (t: number) => number): Coach | null {
  const recent = events.filter((e) => Date.parse(e.started_at) > now - 29 * DAY && Date.parse(e.started_at) <= now)
  const sessions = sideSessions(recent)
  if (sessions.filter((s) => s.at > now - 14 * DAY).length < 3) return null

  // Day totals for the last 14 days.
  const today = startOfDay(now)
  const daily: { day: number; ml: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const day = startOfDay(today - i * DAY + 12 * H)
    const next = startOfDay(day + 36 * H)
    daily.push({ day, ml: sessions.filter((s) => s.at >= day && s.at < next).reduce((t, s) => t + s.ml, 0) })
  }
  const last7 = daily.slice(7).filter((d) => d.ml > 0)
  const prev7 = daily.slice(0, 7).filter((d) => d.ml > 0)
  // Today is still going: leave it out of the average unless it's the only day.
  const full = last7.filter((d) => d.day !== today)
  const mlDay = avg((full.length ? full : last7).map((d) => d.ml))
  const mlDayBefore = prev7.length >= 3 ? avg(prev7.map((d) => d.ml)) : null
  const trend = mlDayBefore ? (mlDay - mlDayBefore) / mlDayBefore : null

  const week = sessions.filter((s) => s.at > now - 7 * DAY)
  const sittings = new Set(week.map((s) => Math.round(s.at / (30 * MIN))))
  const daysWithPump = Math.max(1, new Set(week.map((s) => startOfDay(s.at))).size)
  const one = sessions.filter((s) => s.at > now - 14 * DAY && s.side !== 'both')
  const left = one.filter((s) => s.side === 'left')
  const right = one.filter((s) => s.side === 'right')

  // Yield by three-hour block of the day, from the last two weeks.
  const blocks: Block[] = []
  for (let h = 0; h < 24; h += 3) {
    const xs = one.filter((s) => Math.floor(localMinute(s.at, tz) / 60) >= h && Math.floor(localMinute(s.at, tz) / 60) < h + 3)
    if (xs.length) blocks.push({ hour: h, label: blockLabel(h), ml: Math.round(median(xs.map((s) => s.ml))), n: xs.length })
  }
  const solid = blocks.filter((b) => b.n >= 3)
  const best = solid.length >= 2 ? solid.reduce((a, b) => (b.ml > a.ml ? b : a)) : null

  // Emptyings and the longest stretch without one, over the last 7 full days.
  const em = emptyings(recent.filter((e) => Date.parse(e.started_at) > now - 8 * DAY))
  const gaps: { h: number; at: number }[] = []
  for (let d = 1; d <= 7; d++) {
    const from = today - d * DAY
    const to = from + DAY
    let longest = { h: 0, at: 0 }
    for (let i = 0; i + 1 < em.length; i++) {
      if (em[i].end < from || em[i].end >= to) continue
      const g = (em[i + 1].start - em[i].end) / H
      if (g > longest.h) longest = { h: g, at: em[i].end }
    }
    if (longest.h > 0) gaps.push(longest)
  }
  const emptyingsDay = em.filter((x) => x.start > today - 7 * DAY && x.start < today).length / 7
  const longestGapH = median(gaps.map((g) => g.h))
  const longestGapAt = gaps.length ? Math.round(median(gaps.map((g) => localMinute(g.at, tz)))) : null

  const perSide = median(one.map((s) => s.ml))
  const minutesPerSide = median(one.filter((s) => s.minutes > 0).map((s) => s.minutes))
  const sides = { left: Math.round(median(left.map((s) => s.ml))), right: Math.round(median(right.map((s) => s.ml))), leftN: left.length, rightN: right.length }

  // ---------------------------------------------------------------- suggestions
  const tips: Tip[] = []
  const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`
  if (trend !== null && trend >= 0.08)
    tips.push({ kind: 'good', title: `Up ${pct(trend)} on the week before`, text: 'Whatever you’re doing is working: keep the same rhythm. Supply follows how often and how fully milk is removed.' })
  else if (trend !== null && trend <= -0.1)
    tips.push({
      kind: 'watch',
      title: `Down ${pct(trend)} on the week before`,
      text: 'Dips happen (growth spurts, sleep, stress, a period returning). Removing milk more often brings supply back: add one session, ideally in your longest stretch, or try one “power pumping” hour a day for 2–3 days (pump 20 min, rest 10, pump 10, rest 10, pump 10). If it keeps falling, a lactation consultant can help.',
    })
  else if (trend !== null) tips.push({ kind: 'good', title: 'Steady on the week before', text: 'Your supply is holding. To raise it, add a session rather than pumping longer at the same times.' })

  if (best && perSide > 0 && best.ml >= perSide * 1.2)
    tips.push({ kind: 'idea', title: `Your best time is ${best.label}`, text: `About ${best.ml} ml a side then, against ${Math.round(perSide)} ml usually. Milk builds up over a long stretch, so this is the session to never skip; if you want more, an extra one soon after it adds the most.` })

  if (longestGapH >= 6 && longestGapAt !== null)
    tips.push({
      kind: trend !== null && trend < 0 ? 'watch' : 'idea',
      title: `Your longest stretch is about ${Math.round(longestGapH)} hours`,
      text: `It usually starts around ${clock(longestGapAt)}. Long stretches are fine once supply is settled, but they tell the body to make less. If you want more milk, one pump before you sleep or partway through gives the biggest lift; if supply is steady, protecting your sleep matters too.`,
    })

  if (emptyingsDay > 0 && emptyingsDay < 7)
    tips.push({ kind: 'idea', title: `About ${Math.round(emptyingsDay)} emptyings a day`, text: 'Most mothers keep supply up with 8 or more breastfeeds and pumpings a day in the first months. Adding one is the most reliable way to make more.' })

  if (minutesPerSide > 0 && minutesPerSide < 12)
    tips.push({ kind: 'idea', title: `About ${Math.round(minutesPerSide)} minutes a side`, text: 'Pumping 2–5 minutes past the last drops (often 15–20 minutes in all) empties the breast more fully, which signals more supply. A second let-down often comes if you keep going.' })

  if (sides.leftN >= 3 && sides.rightN >= 3 && Math.max(sides.left, sides.right) >= Math.min(sides.left, sides.right) * 1.3) {
    const low = sides.left < sides.right ? 'left' : 'right'
    tips.push({ kind: 'idea', title: `The ${low} side gives less`, text: `About ${Math.min(sides.left, sides.right)} ml against ${Math.max(sides.left, sides.right)} ml. Very common. Starting feeds or pumping on the ${low} side, or giving it a few extra minutes, can even it out over a couple of weeks.` })
  }

  return {
    mlDay: Math.round(mlDay),
    mlDayBefore: mlDayBefore === null ? null : Math.round(mlDayBefore),
    trend,
    sessionsDay: sittings.size / daysWithPump,
    perSide: Math.round(perSide),
    minutesPerSide: Math.round(minutesPerSide),
    sides,
    blocks,
    best,
    emptyingsDay,
    longestGapH,
    longestGapAt,
    daily,
    tips,
    accuracy: selfCheck(recent, now, tz),
  }
}

/** Each breastfeed or pumping of the last two weeks, against what "time to pump" said just before it. */
function selfCheck(events: Ev[], now: number, tz: string): Coach['accuracy'] {
  const starts = emptyings(events)
    .map((x) => x.start)
    .filter((t) => t > now - 14 * DAY)
  const misses: number[] = []
  for (const t of starts) {
    const due = pumpDue(events.filter((e) => Date.parse(e.started_at) < t - MIN) as never, t - MIN, tz)
    if (due) misses.push(Math.abs(t - due.dueAt) / MIN)
  }
  if (misses.length < 5) return null
  return { checked: misses.length, within30: misses.filter((m) => m <= 30).length, missMin: Math.round(median(misses)) }
}

const clock = (minute: number) => {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}


// ------------------------------------------------------------------------- today's goal
export interface Target {
  /** Pumped so far today. */
  today: number
  /** Her own usual day lately (average of the last 7 days with pumping, to the nearest 10 ml). */
  target: number
  /** What she has usually pumped by this time of day, on those days. */
  byNow: number
  /** Days in a row (to yesterday, and today once reached) at 90% or more of her usual then. */
  streak: number
  hitToday: boolean
  /** Her best day in the last 4 weeks. */
  best: { day: number; ml: number } | null
}

const DAY_BREAK = (startOfDay: (t: number) => number, day: number) => startOfDay(day + 36 * H)

export function pumpTarget(events: Ev[], now: number, tz: string, startOfDay: (t: number) => number): Target | null {
  const sessions = sideSessions(events.filter((e) => Date.parse(e.started_at) > now - 40 * DAY && Date.parse(e.started_at) <= now))
  const today = startOfDay(now)
  const days: { day: number; ml: number; byMinute: { m: number; ml: number }[] }[] = []
  for (let i = 35; i >= 0; i--) {
    const day = startOfDay(today - i * DAY + 12 * H)
    const next = DAY_BREAK(startOfDay, day)
    const xs = sessions.filter((s) => s.at >= day && s.at < next)
    days.push({ day, ml: xs.reduce((t, s) => t + s.ml, 0), byMinute: xs.map((s) => ({ m: localMinute(s.at, tz), ml: s.ml })) })
  }
  const cur = days[days.length - 1]
  const usualBefore = (i: number) => {
    const xs = days.slice(Math.max(0, i - 7), i).filter((d) => d.ml > 0)
    return xs.length >= 3 ? avg(xs.map((d) => d.ml)) : null
  }
  const usual = usualBefore(days.length - 1)
  if (usual === null) return null
  const target = Math.max(10, Math.round(usual / 10) * 10)
  // How far through a usual day she is by now.
  const nowMin = localMinute(now, tz)
  const recent = days.slice(-8, -1).filter((d) => d.ml > 0)
  const frac = avg(recent.map((d) => d.byMinute.filter((x) => x.m <= nowMin).reduce((t, x) => t + x.ml, 0) / d.ml))
  let streak = 0
  for (let i = days.length - 2; i >= 0; i--) {
    const u = usualBefore(i)
    if (u === null || days[i].ml < u * 0.9) break
    streak++
  }
  const hitToday = cur.ml >= target * 0.9
  if (hitToday) streak++
  const pool = days.slice(-29, -1).filter((d) => d.ml > 0)
  const best = pool.length ? pool.reduce((a, b) => (b.ml > a.ml ? b : a)) : null
  return { today: cur.ml, target, byNow: Math.round((target * frac) / 5) * 5, streak, hitToday, best: best && { day: best.day, ml: best.ml } }
}

// ------------------------------------------------------------------------- one sitting
export interface Sitting {
  /** Her usual minutes for a sitting, at least the 15 most mothers need to empty well. */
  minutes: number
  /** Her own typical length, if known. */
  usualMin: number | null
}

export function sitting(events: Ev[], now: number): Sitting {
  const xs = events
    .filter((e) => !e.deleted_at && !e.timer_state && e.type === 'pump' && e.ended_at && Date.parse(e.started_at) > now - 14 * DAY)
    .map((e) => (Date.parse(e.ended_at!) - Date.parse(e.started_at)) / MIN)
    .filter((m) => m >= 3 && m <= 60)
  const usual = xs.length >= 3 ? Math.round(median(xs)) : null
  return { minutes: Math.min(30, Math.max(15, usual ?? 15)), usualMin: usual }
}

/** What to say while pumping, from minutes in and the sitting's length. */
export function sittingPrompt(min: number, s: Sitting): string {
  if (min < 2) return 'Relax your shoulders and breathe out slowly. A look at a photo of your baby helps the milk let down.'
  if (min < 5) return 'Once the milk flows, turn the speed down and the suction up to what’s comfortable, never painful.'
  if (min < s.minutes * 0.6) return 'Gentle breast massage now and then moves more milk. A second let-down often comes if you keep going.'
  if (min < s.minutes) return 'Keep going 2–3 minutes after the last drops: a fuller emptying tells your body to make more.'
  return `That’s your ${s.minutes} minutes. Stop once the flow has stopped for 2 minutes.`
}
