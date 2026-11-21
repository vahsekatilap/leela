// A baby's own routines, from the last week: which things usually happen each day and around
// when, what has happened today, and what is running late. No libraries (the server's nudges use
// the same code).

const H = 3_600_000
const DAY = 24 * H

interface Ev {
  type: string
  child_id: string | null
  started_at: string
  deleted_at: string | null
  timer_state?: string | null
  data: Record<string, unknown>
}

function parts(t: number, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
  const p: Record<string, number> = {}
  for (const x of f.formatToParts(t)) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return { key: `${p.year}-${p.month}-${p.day}`, minute: (p.hour % 24) * 60 + p.minute }
}

/** Activity kinds, as History counts them: the kind, or a known label (older imported entries). */
export function activityKind(e: Pick<Ev, 'data'>, labels: Record<string, string>): string {
  const k = typeof e.data.kind === 'string' ? e.data.kind : ''
  if (k) return k
  const l = typeof e.data.label === 'string' ? e.data.label.trim().toLowerCase() : ''
  const known = Object.entries(labels).find(([, v]) => v.toLowerCase() === l)
  return known ? known[0] : l ? `label:${l}` : 'other'
}

export interface Habit {
  key: string
  /** Days it happened in the last 7 (not counting today). */
  days: number
  /** Usual time of day for the first one, minutes after midnight. */
  minute: number
  /** When it last happened. */
  last: number
  doneToday: boolean
}

/**
 * Each kind of thing that happened in the last week, keyed by `keyOf` (null skips an entry), with
 * how many days it happened and its usual time.
 */
export function habits(events: Ev[], childId: string, keyOf: (e: Ev) => string | null, now: number, timeZone: string): Habit[] {
  const today = parts(now, timeZone).key
  const by = new Map<string, { days: Map<string, number>; last: number; today: boolean }>()
  for (const e of events) {
    if (e.deleted_at || e.child_id !== childId) continue
    const t = Date.parse(e.started_at)
    if (t > now || t < now - 8 * DAY) continue
    const k = keyOf(e)
    if (!k) continue
    const p = parts(t, timeZone)
    const cur = by.get(k) ?? { days: new Map(), last: 0, today: false }
    cur.last = Math.max(cur.last, t)
    if (p.key === today) cur.today = true
    else if (t >= now - 7 * DAY - 12 * H) cur.days.set(p.key, Math.min(cur.days.get(p.key) ?? 1440, p.minute))
    by.set(k, cur)
  }
  const out: Habit[] = []
  for (const [key, v] of by) {
    const mins = [...v.days.values()].sort((a, b) => a - b)
    const minute = mins.length ? mins[Math.floor(mins.length / 2)] : -1
    out.push({ key, days: Math.min(7, v.days.size), minute, last: v.last, doneToday: v.today })
  }
  return out.sort((a, b) => b.days - a.days || a.minute - b.minute)
}

/** Habits kept on most days (4 of the last 7) that haven't happened today. */
export function notYet(hs: Habit[]): Habit[] {
  return hs.filter((h) => h.days >= 4 && !h.doneToday)
}

/** Usual habits now more than `slackMin` past their usual time today. */
export function late(hs: Habit[], now: number, timeZone: string, slackMin = 60): Habit[] {
  const m = parts(now, timeZone).minute
  return notYet(hs).filter((h) => h.minute >= 0 && m > h.minute + slackMin)
}

export const clockOf = (minute: number) => {
  const h = Math.floor(minute / 60) % 24
  return `${((h + 11) % 12) + 1}:${String(minute % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}


export interface UsualTime {
  /** Usual minute after midnight. */
  minute: number
  /** Days in the last 7 with one near this time. */
  days: number
  doneToday: boolean
  /** The latest one today, if any. */
  lastToday: number | null
}

/**
 * Things that happen several times a day (bottles, meals): the times of day they usually happen,
 * found by three-hour block, and whether today's has happened (one within 2 hours of the usual time).
 */
export function usualTimes(events: Ev[], childId: string, match: (e: Ev) => boolean, now: number, timeZone: string): UsualTime[] {
  const today = parts(now, timeZone).key
  const byBlock = new Map<number, Map<string, number[]>>()
  const todays: number[] = []
  let lastToday: number | null = null
  for (const e of events) {
    if (e.deleted_at || e.child_id !== childId || !match(e)) continue
    const t = Date.parse(e.started_at)
    if (t > now || t < now - 8 * DAY) continue
    const p = parts(t, timeZone)
    if (p.key === today) {
      todays.push(p.minute)
      lastToday = Math.max(lastToday ?? 0, t)
      continue
    }
    if (t < now - 7 * DAY - 12 * H) continue
    const b = Math.floor(p.minute / 180)
    const days = byBlock.get(b) ?? new Map<string, number[]>()
    days.set(p.key, [...(days.get(p.key) ?? []), p.minute])
    byBlock.set(b, days)
  }
  const out: UsualTime[] = []
  for (const [, days] of byBlock) {
    if (days.size < 4) continue
    const mins = [...days.values()].map((xs) => xs[0]).sort((a, b) => a - b)
    const minute = mins[Math.floor(mins.length / 2)]
    out.push({ minute, days: days.size, doneToday: todays.some((m) => Math.abs(m - minute) <= 120), lastToday })
  }
  return out.sort((a, b) => a.minute - b.minute)
}

export const minuteNow = (now: number, timeZone: string) => parts(now, timeZone).minute
