// "Add records · voice or text": the family says or types anything that happened, in their own
// words, and the AI (Ghar's lap-tell function, with the LAPdiary sign-in) turns it into entries
// of any kind LAPdiary keeps, daily repeats ("bath every evening since birth") and vitamin
// courses. Nothing changes until Apply; entries are saved as one import, undone in one tap.
//
// The AI is told what LAPdiary can store from TYPES (config.ts) and FIELDS below, so a new entry
// type or field only needs a line in FIELDS to be understood here too.
import { ACTIVITY_KINDS, MILESTONE_KINDS, SYMPTOM_TAGS, TYPES } from './config'
import type { Draft } from './import/parse'
import { markDuplicates } from './import/duplicates'
import { readSupplements } from './supplements'
import type { CourseChange } from './tell'
import { addDaysTz, atLocalTime, dayKey, dayStart } from './time'
import type { Child, EventData, EventType, LeelaEvent } from './types'
import { SCHEDULE } from './vaccines'

/** What each entry type can hold, in words the AI reads. Add a line here for any new field. */
export const FIELDS: Record<EventType, Record<string, string>> = {
  sleep: { kind: 'nap | night', place: 'crib | stroller | car | carrier | other' },
  nursing: { left_s: 'seconds on the left breast', right_s: 'seconds on the right', total_s: 'seconds in all when sides weren’t said', last_side: 'left | right' },
  bottle: { amount_ml: 'number', contents: 'breast | formula | mixed', stash: 'breast milk from: fresh | fridge | freezer' },
  pump: { left_ml: 'number', right_ml: 'number', total_ml: 'number when sides weren’t said', stash: 'where the milk went: fridge | freezer | fed' },
  solids: { foods: 'list of { name, first: true if the first time }', eaten: 'taste | some | most | all', reaction: 'liked | neutral | disliked', drink: "'water' for a drink of water (with amount_ml)", amount_ml: 'number, for water' },
  diaper: { kind: 'wet | dirty | mixed | dry', color: 'words', texture: 'words', rash: 'true | false' },
  potty: { outcome: 'potty | accident', kind: 'wet | dirty | mixed' },
  growth: { weight_kg: 'number (convert grams or pounds)', length_cm: 'number', head_cm: 'number' },
  temperature: { temp_c: 'number in °C (convert °F)', method: 'armpit | oral | ear | forehead | rectal' },
  medicine: { name: 'medicine name', dose: 'amount as said', unit: 'drops | ml | mg | tablet | sachet', supplement: 'true for daily vitamins and supplements' },
  symptom: { kind: "'symptom' | 'visit' (a doctor visit) | 'vaccine'", tags: `list of: ${SYMPTOM_TAGS.join(', ')} (or other words)`, vax: 'list of vaccine dose ids given (see doses)' },
  activity: { kind: ACTIVITY_KINDS.map((k) => `${k.id} (${k.label})`).join(' | '), where: 'place, for outings', label: 'name, when none of the kinds fit' },
  milestone: { kind: MILESTONE_KINDS.map((k) => `${k.id} (${k.label})`).join(' | '), label: 'what it was, when none of the kinds fit' },
  note: { title: 'short heading', body: 'the note' },
  contraction: { intensity: 'mild | moderate | strong' },
}

/** The description of LAPdiary the AI works from. */
export function schemaText(child: Child): string {
  const types = (Object.keys(TYPES) as EventType[])
    .map((t) => `- ${t} (${TYPES[t].label}${TYPES[t].timer ? ', has start and end' : ''}): ${Object.entries(FIELDS[t] ?? {}).map(([k, v]) => `${k}: ${v}`).join('; ')}`)
    .join('\n')
  const doses = SCHEDULE.flatMap((v) => v.doses.map((d) => `${d.id} = ${d.name} (${v.label})`)).join('; ')
  const sups = readSupplements(child.settings).map((s) => `${s.name}${s.dose ? ` ${s.dose} ${s.unit ?? ''}` : ''}`).join(', ') || 'none yet'
  return `Entry types and their data fields:\n${types}\nVaccine doses: ${doses}\nDaily vitamins on the list: ${sups}`
}

export interface RecordChange {
  type: EventType
  /** Local time, "YYYY-MM-DDTHH:MM". */
  start: string
  end?: string
  data: EventData
  notes?: string
  /** Every day from `from` to `until` (YYYY-MM-DD) at `time` (HH:MM) instead of once. */
  repeat?: { from: string; until: string; time?: string }
}

export interface Understood {
  records: RecordChange[]
  courses: CourseChange[]
  reply?: string
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isLocal = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)
const isTime = (v: unknown): v is string => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)

/** Keeps only the fields LAPdiary knows for the type, with numbers as numbers. */
function cleanData(type: EventType, raw: unknown): EventData {
  const allowed = FIELDS[type] ?? {}
  const out: EventData = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in allowed) || v === null || v === undefined || v === '') continue
    if (/_(s|ml|kg|cm|c)$/.test(k)) {
      const n = typeof v === 'number' ? v : Number(v)
      if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n * 100) / 100
    } else if (k === 'foods' && Array.isArray(v)) {
      out.foods = v.filter((f) => f && typeof f.name === 'string').slice(0, 12).map((f) => ({ name: String(f.name).slice(0, 40), ...(f.first ? { first: true } : {}) }))
    } else if ((k === 'tags' || k === 'vax') && Array.isArray(v)) {
      out[k] = v.filter((x) => typeof x === 'string').slice(0, 12)
    } else if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string') out[k] = v.slice(0, k === 'body' ? 4000 : 120)
  }
  return out
}

/** The reply from lap-tell, cleaned up. */
export function parseUnderstood(body: { records?: unknown[]; changes?: unknown[]; reply?: string }): Understood {
  const records: RecordChange[] = []
  for (const r of body.records ?? []) {
    const o = r as Record<string, unknown>
    const type = o.type as EventType
    if (!TYPES[type] || !isLocal(o.start)) continue
    const rep = o.repeat as Record<string, unknown> | undefined
    records.push({
      type,
      start: o.start,
      end: isLocal(o.end) ? o.end : undefined,
      data: cleanData(type, o.data),
      notes: typeof o.notes === 'string' && o.notes.trim() ? o.notes.trim().slice(0, 500) : undefined,
      repeat: rep && isDay(rep.from) && isDay(rep.until) ? { from: rep.from, until: rep.until, time: isTime(rep.time) ? rep.time : undefined } : undefined,
    })
  }
  const courses: CourseChange[] = []
  for (const c of body.changes ?? []) {
    const o = c as Record<string, unknown>
    if (o.kind !== 'supplement' || typeof o.name !== 'string' || !o.name.trim()) continue
    courses.push({
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
  return { records, courses, reply: typeof body.reply === 'string' ? body.reply.slice(0, 400) : undefined }
}

const at = (local: string, tz: string) => atLocalTime(`${local.slice(0, 10)}T12:00:00`, local.slice(11, 16), tz).getTime()

/** The entries a change makes (one, or one a day for a repeat, up to today and never in the future). */
export function draftsOf(r: RecordChange, tz: string, now: number, words: string, i: number): Draft[] {
  const make = (start: number, end: number | null, k: string): Draft => ({ key: `say-${i}-${k}`, type: r.type, start, end, data: r.data, notes: r.notes ?? null, source: words, line: 0, include: true, flags: [] })
  const s = at(r.start, tz)
  const len = r.end ? Math.max(0, at(r.end, tz) - s) : null
  if (!r.repeat) return s > now + 60_000 ? [] : [make(s, len === null ? null : s + len, '0')]
  const time = r.repeat.time ?? r.start.slice(11, 16)
  const out: Draft[] = []
  const today = dayKey(now, tz)
  for (let d = dayStart(`${r.repeat.from}T12:00:00`, tz).getTime(), n = 0; n < 800; d = addDaysTz(d, 1, tz).getTime(), n++) {
    const k = dayKey(d, tz)
    if (k > r.repeat.until || k > today) break
    const t = atLocalTime(`${k}T12:00:00`, time, tz).getTime()
    if (t > now + 60_000) break
    out.push(make(t, len === null ? null : t + len, k))
  }
  return out
}

/** All drafts for the changes picked, with ones already in LAPdiary left out. */
export function planRecords(rs: RecordChange[], events: LeelaEvent[], childId: string, tz: string, words: string): { drafts: Draft[]; skipped: number } {
  const all = rs.flatMap((r, i) => draftsOf(r, tz, Date.now(), words, i))
  const marked = markDuplicates(all, events, childId)
  return { drafts: marked.filter((d) => d.include), skipped: marked.filter((d) => !d.include).length }
}
