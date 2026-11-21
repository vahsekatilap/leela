// "Tell LAPdiary": the family says or types what happened in their own words ("Vitamin D was
// started on 21 July and given every day, until her first birthday"), the AI (through Ghar's
// lap-tell function, with the LAPdiary sign-in) turns it into changes, the family sees them and
// taps Apply. Past doses are saved as one import, so they can be undone from Past logs and data.
import { commitImport } from './import/save'
import type { Draft } from './import/parse'
import { saveChildSettings } from './actions'
import { readSupplements, sameName, type Supplement } from './supplements'
import { supabase } from './supabase'
import { addDaysTz, atLocalTime, dayKey, dayStart } from './time'
import type { Child, LeelaEvent } from './types'
import { uuid } from './uuid'

const GHAR_TELL = 'https://sfjzdkajewcrcqzbpyou.supabase.co/functions/v1/lap-tell'

/** One change the AI understood: a vitamin or supplement course, and whether it was given daily. */
export interface CourseChange {
  kind: 'supplement'
  name: string
  dose?: string
  unit?: string
  /** First day of the course (YYYY-MM-DD). */
  from?: string
  /** Last day (YYYY-MM-DD), when there's an end. */
  until?: string
  /** It was given every day since `from`: fill in the missing past days. */
  dailySince?: boolean
  /** The family's own words for the end, e.g. "her first birthday". */
  untilWords?: string
}

export interface Understood {
  changes: CourseChange[]
  /** What the AI couldn't turn into a change, said back kindly. */
  reply?: string
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export async function understand(text: string, child: Child, tz: string): Promise<Understood> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in again, then try once more.')
  const res = await fetch(GHAR_TELL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      text: text.slice(0, 2000),
      today: dayKey(Date.now(), tz),
      birth: child.birth_date,
      name: child.name,
      supplements: readSupplements(child.settings).map((s) => ({ name: s.name, dose: s.dose, unit: s.unit, from: s.from, until: s.until })),
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { changes?: unknown[]; reply?: string; error?: string }
  if (!res.ok) throw new Error(body.error === 'busy' ? 'LAPdiary is busy understanding others right now. Try again in a minute.' : 'Couldn’t understand that just now. Try again in a moment.')
  const changes: CourseChange[] = []
  for (const c of body.changes ?? []) {
    const o = c as Record<string, unknown>
    if (o.kind !== 'supplement' || typeof o.name !== 'string' || !o.name.trim()) continue
    changes.push({
      kind: 'supplement',
      name: o.name.trim().slice(0, 40),
      dose: typeof o.dose === 'string' && o.dose.trim() ? o.dose.trim().slice(0, 12) : undefined,
      unit: typeof o.unit === 'string' && o.unit.trim() ? o.unit.trim().slice(0, 12) : undefined,
      from: isDay(o.from) ? o.from : undefined,
      until: isDay(o.until) ? o.until : undefined,
      dailySince: o.daily_since_from === true,
      untilWords: typeof o.until_words === 'string' ? o.until_words.slice(0, 60) : undefined,
    })
  }
  return { changes, reply: typeof body.reply === 'string' ? body.reply.slice(0, 400) : undefined }
}

/** The past days a daily course is missing an entry for, from its first day up to yesterday. */
export function missingDays(c: CourseChange, events: LeelaEvent[], childId: string, tz: string, now: number): string[] {
  if (!c.dailySince || !c.from) return []
  const have = new Set(events.filter((e) => !e.deleted_at && e.type === 'medicine' && e.child_id === childId && sameName(e.data.name, c.name)).map((e) => dayKey(e.started_at, tz)))
  const today = dayKey(now, tz)
  const last = c.until && c.until < today ? c.until : null
  const out: string[] = []
  for (let d = dayStart(`${c.from}T12:00:00`, tz).getTime(), i = 0; i < 800; d = addDaysTz(d, 1, tz).getTime(), i++) {
    const k = dayKey(d, tz)
    if (k >= today || (last && k > last)) break
    if (!have.has(k)) out.push(k)
  }
  return out
}

/** The usual time it's given (from entries already logged), or 9 in the morning. */
function usualTime(name: string, events: LeelaEvent[], childId: string, tz: string): string {
  const mins = events
    .filter((e) => !e.deleted_at && e.type === 'medicine' && e.child_id === childId && sameName(e.data.name, name))
    .map((e) => {
      const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(Date.parse(e.started_at))
      const [h, m] = p.split(':').map(Number)
      return h * 60 + m
    })
    .sort((a, b) => a - b)
  if (!mins.length) return '09:00'
  const m = mins[Math.floor(mins.length / 2)]
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Saves the course on the vitamins list and fills in the missing past doses (as one import). */
export async function applyChange(c: CourseChange, child: Child, events: LeelaEvent[], tz: string, words: string): Promise<{ added: number }> {
  const list = readSupplements(child.settings)
  const old = list.find((s) => sameName(s.name, c.name))
  const next: Supplement = {
    id: old?.id ?? uuid(),
    name: old?.name ?? c.name,
    dose: c.dose ?? old?.dose,
    unit: c.unit ?? old?.unit,
    from: c.from ?? old?.from,
    until: c.until ?? old?.until,
  }
  await saveChildSettings(child.id, 'supplements', old ? list.map((s) => (s.id === old.id ? next : s)) : [...list, next])
  const days = missingDays(c, events, child.id, tz, Date.now())
  if (!days.length) return { added: 0 }
  const at = usualTime(next.name, events, child.id, tz)
  const drafts: Draft[] = days.map((d, i) => ({
    key: `tell-${i}`,
    type: 'medicine',
    start: atLocalTime(`${d}T12:00:00`, at, tz).getTime(),
    end: null,
    data: { name: next.name, dose: next.dose, unit: next.unit, supplement: true },
    notes: null,
    source: words,
    line: 0,
    include: true,
    flags: [],
  }))
  const res = await commitImport({ drafts, childId: child.id, fileName: `Told: ${words.slice(0, 120)}`, reader: 'text' })
  return { added: res.saved }
}
