// Nudges: what to say, and when. Strict underneath, gentle on the phone.
//
// - Timing comes from the family's own rhythm (routine.ts, the sweet spot, pumping), checked
//   against global guidance (WHO, IAP, CDC). Their way wins unless it strays far from the guidance.
// - Words are kind and brief: what would help next, never what was missed. When the last day
//   explains a longer gap (an outing, vaccines, her feeling unwell), the nudge says so warmly.
// - "Important" is kept for a real miss: no wet nappy for many hours, a very long stretch without
//   a feed, a daily vitamin missed two days running, a breast unemptied for many hours, fridge milk
//   past its 4 days. Calm and clear, with what to do.
// No libraries: the server's notifications use the same code.
import { activityKind, clockOf, habits, late, minuteNow, usualTimes } from './routine'
import { milkStash, type StashCount } from './stash'

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

export interface Nudge {
  slot: string
  title: string
  body: string
  important?: boolean
}

export const ACTIVITY_NAMES: Record<string, string> = {
  tummy: 'Tummy time',
  bath: 'Bath',
  massage: 'Massage',
  outing: 'Outing',
  outdoor: 'Outdoor play',
  indoor: 'Indoor play',
  story: 'Story time',
  screen: 'Screen time',
  skin: 'Skin-to-skin',
  teeth: 'Teeth brushing',
}

const clock = (t: number, tz: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(t)
const hours = (ms: number) => {
  const m = Math.round(ms / MIN)
  const h = Math.floor(m / 60)
  return h ? (m % 60 ? `${h} h ${m % 60} m` : `${h} h`) : `${m} m`
}
const hourOf = (t: number, tz: string) => Math.floor(minuteNow(t, tz) / 60)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// ------------------------------------------------------------------------- the last day
export interface Context {
  /** An outing or visit in the last day and a half: where, or '' when not said. */
  outing: string | null
  vaccine: boolean
  unwell: boolean
}

export function dayContext(events: Ev[], childId: string, now: number): Context {
  let outing: string | null = null
  let vaccine = false
  let unwell = false
  for (const e of events) {
    if (e.deleted_at || (e.child_id && e.child_id !== childId)) continue
    const t = Date.parse(e.started_at)
    if (t > now) continue
    if (e.type === 'activity' && e.data.kind === 'outing' && t > now - 30 * H) outing = typeof e.data.where === 'string' ? e.data.where.trim() : ''
    if (e.type === 'symptom' && e.data.kind === 'vaccine' && t > now - 48 * H) vaccine = true
    if (t > now - DAY && ((e.type === 'symptom' && e.data.kind === 'symptom') || (e.type === 'temperature' && num(e.data.temp_c) >= 37.5))) unwell = true
  }
  return { outing, vaccine, unwell }
}

/** One warm sentence about the last day, if it explains a slower pace. */
function understanding(c: Context, what: 'pump' | 'baby'): string {
  const pace = what === 'pump' ? 'a longer stretch is only natural' : 'a gentler pace today is only natural'
  if (c.vaccine) return what === 'pump' ? `Vaccine days are busy ones, so ${pace}.` : `After her vaccines she may want extra rest and cuddles, so ${pace}.`
  if (c.unwell) return `With her feeling a little under the weather, ${pace}.`
  if (c.outing !== null) return `${c.outing ? `The visit to ${c.outing}` : 'Being out and about'} made for a full day, so ${pace}.`
  return ''
}

// ------------------------------------------------------------------------- pumping
/** "This week you're averaging 210 ml a day, up on the week before. Lovely work." */
function pumpPraise(events: Ev[], now: number): string {
  const day = (from: number, to: number) => {
    const byDay = new Map<number, number>()
    for (const e of events) {
      if (e.deleted_at || e.timer_state || e.type !== 'pump') continue
      const t = Date.parse(e.started_at)
      if (t < from || t >= to) continue
      const ml = num(e.data.left_ml) + num(e.data.right_ml) || num(e.data.total_ml)
      const k = Math.floor((t - from) / DAY)
      byDay.set(k, (byDay.get(k) ?? 0) + ml)
    }
    const xs = [...byDay.values()].filter((v) => v > 0)
    return xs.length >= 3 ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }
  const week = day(now - 7 * DAY, now)
  const before = day(now - 14 * DAY, now - 7 * DAY)
  if (!week) return 'Every session counts.'
  const up = before && week >= before * 1.05
  return `This week you’re averaging ${Math.round(week / 10) * 10} ml a day${up ? ', up on the week before' : ''}. Lovely work.`
}

interface Due {
  side: 'left' | 'right'
  lastAt: number
  everyMin: number
  dueAt: number
  other?: Omit<Due, 'other'>
}

/** Time to pump: the best window, kindly, with a word on the last day when the gap ran long. */
export function pumpNudge(p: Due, events: Ev[], childId: string | null, now: number, tz: string, ml: number | null): Nudge {
  const long = now - p.lastAt > p.everyMin * MIN * 1.25
  const soft = long && childId ? understanding(dayContext(events, childId, now), 'pump') : ''
  const end = Math.max(now + 15 * MIN, p.dueAt + 30 * MIN)
  const side = p.other ? `, ${p.side} side first` : ''
  return {
    slot: `pump/${p.side}/${p.lastAt}`,
    title: p.other ? `A good time to pump: ${p.side} side` : 'A good time to pump',
    body: [soft, pumpPraise(events, now), `Best window: now until ${clock(end, tz)}${side}${ml ? `, usually about ${ml} ml` : ''}.`].filter(Boolean).join(' '),
  }
}

/** Important: a breast not emptied for 8 hours or more, in the day. */
export function pumpLongGapNudge(p: Due, now: number, tz: string): Nudge | null {
  const h = hourOf(now, tz)
  if (h < 7 || h >= 23) return null
  const sides = [p, ...(p.other ? [p.other] : [])].filter((x) => now - x.lastAt >= 8 * H)
  if (!sides.length) return null
  const x = sides[0]
  const named = p.other ? `the ${x.side} side has` : 'it’s'
  return {
    slot: `imp/pump/${x.side}/${x.lastAt}`,
    important: true,
    title: p.other ? `Important: the ${x.side} side` : 'Important: a long stretch',
    body: `${named[0].toUpperCase()}${named.slice(1)} been ${hours(now - x.lastAt)} since the last emptying. When you can, feed or pump to stay comfortable and protect your supply. If the breast feels hard, hot or painful, or you feel feverish, call your doctor.`,
  }
}

/** Important: fridge milk that passed its 4 days in the last day and is still counted. */
export function fridgePastNudge(events: Ev[], now: number, tz: string, count?: StashCount | null): Nudge[] {
  return milkStash(events as never, now, count)
    .lots.filter((l) => l.place === 'fridge' && !l.id.startsWith('count-') && l.useBy <= now && l.useBy > now - DAY)
    .map((l) => ({
      slot: `imp/stash/${l.id}`,
      important: true,
      title: 'Important: fridge milk past 4 days',
      body: `${Math.round(l.left)} ml pumped ${new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(l.at)} ${clock(l.at, tz)} has passed the 4 days advised for the fridge. Best not to use it; mark it as gone in LAPdiary.`,
    }))
}

// ------------------------------------------------------------------------- long sleeps
/**
 * Time between two moments spent in long sleeps (4 hours or more: her night, whenever that is for
 * her). Feeds and nappy changes wait while she sleeps, so that time isn't counted as time in the day.
 */
function longSleepMs(events: Ev[], childId: string, from: number, to: number): number {
  let ms = 0
  for (const x of longSleeps(events, childId, to)) ms += Math.max(0, Math.min(x.e, to) - Math.max(x.s, from))
  return ms
}

/** Her long sleeps (4 hours or more), a quick resettle within 20 minutes counted as the same sleep. */
function longSleeps(events: Ev[], childId: string, to: number): { s: number; e: number }[] {
  const list = events
    .filter((e) => !e.deleted_at && e.type === 'sleep' && e.child_id === childId)
    .map((e) => {
      const s = Date.parse(e.started_at)
      return { s, e: e.ended_at ? Date.parse(e.ended_at) : e.timer_state ? to : s }
    })
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s)
  // A sleep that resumes within 20 minutes (a quick resettle) is one sleep.
  const merged: { s: number; e: number }[] = []
  for (const x of list) {
    const prev = merged[merged.length - 1]
    if (prev && x.s - prev.e < 20 * MIN) prev.e = Math.max(prev.e, x.e)
    else merged.push({ ...x })
  }
  return merged.filter((x) => x.e - x.s >= 4 * H)
}

/** Just up from her night (a long sleep ended within the hour): gentle notes wait (Keshav, 24 Nov 2026). */
function justWoke(events: Ev[], childId: string, now: number): boolean {
  return longSleeps(events, childId, now).some((x) => x.e <= now && now - x.e < 60 * MIN)
}

// ------------------------------------------------------------------------- feeds
/** Longest daytime stretch between feeds that's usual at this age (from common guidance), hours. */
function feedGapLimit(ageDays: number | null): number | null {
  if (ageDays === null) return null
  if (ageDays < 56) return 3.5
  if (ageDays < 122) return 4
  if (ageDays < 183) return 4.5
  if (ageDays < 365) return 5
  return null
}

/**
 * A feed: gently when well past her own usual gap; Important when longer than babies her age
 * usually go in the day. Only while she's awake, from what's logged (call only then).
 */
export function feedNudge(
  f: { at: number; last: number; everyMin: number; range?: [number, number]; basis: string },
  ageDays: number | null,
  name: string,
  events: Ev[],
  childId: string,
  now: number,
  tz: string,
): Nudge | null {
  if (f.basis !== 'logs') return null
  const gap = now - f.last
  const limit = feedGapLimit(ageDays)
  const h = hourOf(now, tz)
  // Her night's sleep isn't part of the stretch: only time in the day counts.
  if (limit && gap - longSleepMs(events, childId, f.last, now) > (limit + 0.5) * H && h >= 7 && h < 22)
    return {
      slot: `imp/feed/${f.last}`,
      important: true,
      title: 'Important: time for a feed',
      body: `It’s been ${hours(gap)} since ${name}’s last feed at ${clock(f.last, tz)}, longer than babies her age usually go in the day. Offer a feed now; if she isn’t interested or seems unwell, call her doctor.`,
    }
  const lateAt = (f.range?.[1] ?? f.at + 30 * MIN) + 30 * MIN
  if (now < lateAt || now >= lateAt + 2 * H || justWoke(events, childId, now)) return null
  return {
    slot: `late/feed/${f.last}`,
    title: 'Maybe time for a feed',
    body: [understanding(dayContext(events, childId, now), 'baby'), `Her last feed was at ${clock(f.last, tz)}; around now she usually feeds about every ${hours(f.everyMin * MIN)}.`].filter(Boolean).join(' '),
  }
}

// ------------------------------------------------------------------------- nappies
/** Important: no wet nappy for many hours, for a family that logs nappies regularly. */
export function nappyNudge(events: Ev[], childId: string, name: string, ageDays: number | null, now: number, tz: string): Nudge | null {
  if (ageDays === null || ageDays >= 365 || ageDays < 5) return null
  const h = hourOf(now, tz)
  if (h < 7 || h >= 22) return null
  const wet = events
    .filter((e) => !e.deleted_at && e.type === 'diaper' && e.child_id === childId && (e.data.kind === 'wet' || e.data.kind === 'mixed') && Date.parse(e.started_at) <= now)
    .map((e) => Date.parse(e.started_at))
    .sort((a, b) => a - b)
  if (wet.filter((t) => t > now - 7 * DAY).length < 28) return null // not logged closely enough to tell
  const last = wet[wet.length - 1]
  const limit = (ageDays < 183 ? 6 : 8) * H
  // Nappies wait while she sleeps the night: that time isn't counted.
  if (now - last - longSleepMs(events, childId, last, now) < limit) return null
  return {
    slot: `imp/nappy/${last}`,
    important: true,
    title: 'Important: a wet nappy check',
    body: `The last wet nappy logged was at ${clock(last, tz)}, ${hours(now - last)} ago. Offer a feed and check ${name}’s nappy. If she has far fewer wet nappies than usual, seems drowsy or her mouth looks dry, call her doctor.`,
  }
}

// ------------------------------------------------------------------------- vitamins
/** Gentle in the evening; Important when the same one wasn't logged yesterday either. */
export function vitaminsNudge(name: string, leftToday: string[], leftYesterday: string[], day: string): Nudge | null {
  if (!leftToday.length) return null
  const twice = leftToday.filter((v) => leftYesterday.includes(v))
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0])
  if (twice.length)
    return {
      slot: `imp/vit/${day}`,
      important: true,
      title: `Important: ${list(twice)}`,
      body: `${name}’s ${list(twice)} wasn’t logged yesterday or yet today. A daily dose is what helps; if it was given and not logged, add it in LAPdiary.`,
    }
  return { slot: `vit/${day}`, title: 'Her vitamins, when you’re ready', body: `${list(leftToday)} not logged yet today.` }
}

// ------------------------------------------------------------------------- the day's rhythm
const ACTIVITY_TITLES: Record<string, string> = {
  tummy: 'A little tummy time?',
  bath: 'Bath time, whenever it suits',
  massage: 'Massage time, whenever it suits',
  story: 'A story together?',
  outdoor: 'Some fresh air?',
  indoor: 'Some play time?',
  skin: 'Some skin-to-skin?',
  teeth: 'Teeth brushing, whenever it suits',
}

/**
 * What she usually has by now but hasn't today, said gently: a daily activity kept on most days
 * this week (an hour past its usual time), or a usual bottle or meal (an hour past, for two
 * hours). Screen time and outings are never nudged.
 */
export function routineNudges(events: Ev[], childId: string, name: string, now: number, tz: string, day: string): Nudge[] {
  const out: Nudge[] = []
  if (justWoke(events, childId, now)) return out
  const m = minuteNow(now, tz)
  const soft = understanding(dayContext(events, childId, now), 'baby')
  const acts = habits(events as never, childId, (e) => (e.type === 'activity' ? activityKind(e, ACTIVITY_NAMES) : null), now, tz)
  for (const h of late(acts, now, tz, 60)) {
    const title = ACTIVITY_TITLES[h.key]
    if (!title || m > h.minute + 4 * 60) continue
    const label = ACTIVITY_NAMES[h.key].toLowerCase()
    const extra = h.key === 'tummy' ? 'A few minutes at a time adds up; about 30 minutes across the day is what the WHO suggests.' : soft || 'No rush: a little later works just as well.'
    out.push({ slot: `late/${h.key}/${day}`, title, body: `${name} usually has ${h.key === 'tummy' ? 'tummy time' : `her ${label}`} around ${clockOf(h.minute)}. ${extra}` })
  }
  const kinds: { key: string; what: string; match: (e: Ev) => boolean; line: string }[] = [
    { key: 'bottle', what: 'bottle', match: (e) => e.type === 'bottle', line: `Around now is when ${name} usually has it.` },
    { key: 'meal', what: 'meal', match: (e) => e.type === 'solids' && typeof e.data.drink !== 'string', line: 'Around now is when she usually eats. Whatever she enjoys is a win.' },
  ]
  for (const k of kinds) {
    for (const u of usualTimes(events as never, childId, k.match as never, now, tz)) {
      if (u.doneToday || m < u.minute + 60 || m > u.minute + 180) continue
      out.push({ slot: `late/${k.key}-${u.minute}/${day}`, title: `Her ${clockOf(u.minute)} ${k.what}`, body: k.line })
    }
  }
  return out
}
