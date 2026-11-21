// The doctor visit helper: what has changed since the last visit, in plain words, and the
// questions to ask (suggested from the logs, plus the family's own).
import { foodsTried } from './solids'
import { SKILLS, skillsDone } from './development'
import { isSupplement } from './insights'
import { readSupplements } from './supplements'
import { vaccinePlan } from './vaccines'
import type { Child, LeelaEvent } from './types'

const H = 3_600_000
const DAY = 24 * H

export interface Question {
  id: string
  text: string
  /** What the doctor said, filled in at the visit. */
  answer?: string
}

export function readQuestions(settings: Record<string, unknown> | null | undefined): Question[] {
  const raw = (settings?.visit as { questions?: unknown } | undefined)?.questions
  return Array.isArray(raw) ? raw.filter((q): q is Question => Boolean(q) && typeof (q as Question).text === 'string' && typeof (q as Question).id === 'string') : []
}

export interface Change {
  label: string
  text: string
}

export interface VisitBrief {
  lastVisit: LeelaEvent | null
  since: number
  changes: Change[]
  suggested: string[]
}

const hm = (ms: number) => {
  const m = Math.round(ms / 60_000)
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`
}
const kg = (v: number) => `${v.toFixed(2).replace(/0$/, '')} kg`
const shortDate = (t: number, tz: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(t)

/** Per-day figures for the 7 days before `end` (days with anything logged only). */
function week(events: LeelaEvent[], childId: string, end: number) {
  const from = end - 7 * DAY
  const xs = events.filter((e) => !e.deleted_at && e.child_id === childId && Date.parse(e.started_at) >= from && Date.parse(e.started_at) < end)
  const days = new Set(xs.map((e) => Math.floor((Date.parse(e.started_at) - from) / DAY)))
  const n = Math.max(1, days.size)
  let sleep = 0
  let longest = 0
  for (const e of xs) {
    if (e.type !== 'sleep' || !e.ended_at) continue
    const ms = Date.parse(e.ended_at) - Date.parse(e.started_at)
    if (ms > 0 && ms < 16 * H) {
      sleep += ms
      longest = Math.max(longest, ms)
    }
  }
  const count = (f: (e: LeelaEvent) => boolean) => xs.filter(f).length / n
  return {
    days: days.size,
    sleep: sleep / n,
    longest,
    feeds: count((e) => e.type === 'nursing' || e.type === 'bottle'),
    bottleMl: xs.filter((e) => e.type === 'bottle').reduce((t, e) => t + (e.data.amount_ml ?? 0), 0) / n,
    wet: count((e) => e.type === 'diaper' && (e.data.kind === 'wet' || e.data.kind === 'mixed')),
    dirty: count((e) => e.type === 'diaper' && (e.data.kind === 'dirty' || e.data.kind === 'mixed')),
  }
}

export function visitBrief(events: LeelaEvent[], child: Child, now: number, tz: string): VisitBrief {
  const mine = events.filter((e) => !e.deleted_at && e.child_id === child.id && Date.parse(e.started_at) <= now)
  const lastVisit = mine.filter((e) => e.type === 'symptom' && e.data.kind === 'visit').sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null
  const since = lastVisit ? Date.parse(lastVisit.started_at) : now - 30 * DAY
  const after = mine.filter((e) => Date.parse(e.started_at) >= since)
  const changes: Change[] = []
  const suggested: string[] = []

  // Growth: the latest measurement, and the change since the one before the last visit.
  const growth = mine.filter((e) => e.type === 'growth').sort((a, b) => a.started_at.localeCompare(b.started_at))
  const latestW = [...growth].reverse().find((e) => e.data.weight_kg)
  const beforeW = [...growth].reverse().find((e) => e.data.weight_kg && Date.parse(e.started_at) < since)
  if (latestW) {
    const w = latestW.data.weight_kg!
    const at = Date.parse(latestW.started_at)
    let text = `${kg(w)} on ${shortDate(at, tz)}`
    if (beforeW && beforeW !== latestW) {
      const g = Math.round((w - beforeW.data.weight_kg!) * 1000)
      const days = Math.max(1, Math.round((at - Date.parse(beforeW.started_at)) / DAY))
      text += `, ${g >= 0 ? '+' : ''}${g} g in ${days} days (about ${Math.round((g / days) * 7)} g a week)`
    }
    changes.push({ label: 'Weight', text })
    suggested.push('Is her weight gain on track for her age?')
  }
  const latestL = [...growth].reverse().find((e) => e.data.length_cm)
  if (latestL) changes.push({ label: 'Length', text: `${latestL.data.length_cm} cm on ${shortDate(Date.parse(latestL.started_at), tz)}` })
  const latestHd = [...growth].reverse().find((e) => e.data.head_cm)
  if (latestHd) changes.push({ label: 'Head', text: `${latestHd.data.head_cm} cm on ${shortDate(Date.parse(latestHd.started_at), tz)}` })

  // The last week against the week before the last visit.
  const now7 = week(mine, child.id, now)
  const then7 = lastVisit ? week(mine, child.id, since) : null
  const vs = (b: number | undefined, f: (x: number) => string) => (b !== undefined && then7 && then7.days >= 3 ? ` (${f(b)} before the last visit)` : '')
  if (now7.days >= 3) {
    if (now7.sleep > 0) changes.push({ label: 'Sleep', text: `${hm(now7.sleep)} a day this week${vs(then7?.sleep, hm)}; longest stretch ${hm(now7.longest)}` })
    if (now7.feeds > 0) changes.push({ label: 'Feeds', text: `${Math.round(now7.feeds * 10) / 10} a day${now7.bottleMl ? `, ${Math.round(now7.bottleMl)} ml from bottles` : ''}${vs(then7?.feeds, (x) => `${Math.round(x * 10) / 10}`)}` })
    if (now7.wet + now7.dirty > 0) changes.push({ label: 'Nappies', text: `${Math.round(now7.wet)} wet and ${Math.round(now7.dirty)} dirty a day` })
  }

  // Health since the last visit.
  const temps = after.filter((e) => e.type === 'temperature' && typeof e.data.temp_c === 'number')
  const fevers = temps.filter((e) => e.data.temp_c! >= 38)
  if (temps.length) {
    const top = temps.reduce((a, b) => (b.data.temp_c! > a.data.temp_c! ? b : a))
    changes.push({ label: 'Temperature', text: `${temps.length} ${temps.length === 1 ? 'reading' : 'readings'}, highest ${top.data.temp_c} °C on ${shortDate(Date.parse(top.started_at), tz)}` })
    if (fevers.length) suggested.push(`She had a temperature of ${top.data.temp_c} °C on ${shortDate(Date.parse(top.started_at), tz)}. Anything to watch for, and when should we call?`)
  }
  const meds = new Map<string, number>()
  for (const e of after) if (e.type === 'medicine' && !e.data.supplement && !isSupplement(e)) meds.set(String(e.data.name ?? 'Medicine'), (meds.get(String(e.data.name ?? 'Medicine')) ?? 0) + 1)
  if (meds.size) {
    changes.push({ label: 'Medicines', text: [...meds].map(([n, c]) => `${n} ×${c}`).join(', ') })
    suggested.push(`${[...meds.keys()].join(' and ')}: is the dose still right for her weight?`)
  }
  const symptoms = after.filter((e) => e.type === 'symptom' && e.data.kind === 'symptom')
  if (symptoms.length) {
    const words = [...new Set(symptoms.flatMap((e) => (e.data.tags ?? [])).concat(symptoms.map((e) => e.notes ?? '').filter(Boolean)))].slice(0, 5)
    changes.push({ label: 'Symptoms', text: `${symptoms.length} logged${words.length ? `: ${words.join(', ')}` : ''}` })
    suggested.push('The symptoms we noted: is there anything to do about them?')
  }

  // Vaccines.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
  const plan = vaccinePlan(child, mine as never, today)
  const dueNow = plan.filter((p) => !p.done && p.inDays <= 14)
  const nextLater = plan.find((p) => !p.done && p.inDays > 14)
  if (dueNow.length) {
    const doses = dueNow.flatMap((p) => p.left.map((d) => d.name))
    changes.push({ label: 'Vaccines', text: `${dueNow.some((p) => p.inDays < 0) ? 'Due now' : 'Coming up'}: ${doses.join(', ')}` })
    suggested.push(`Can she have ${doses.join(', ')} at this visit?`)
  } else if (nextLater) changes.push({ label: 'Vaccines', text: `Up to date. Next: ${nextLater.visit.label}` })

  // Vitamins, solids, development.
  const sups = readSupplements(child.settings)
  if (sups.length) suggested.push(`Should we carry on with ${sups.map((s) => s.name).join(' and ')}, and at the same dose?`)
  const foods = foodsTried(mine, child.id)
  const ageM = child.birth_date ? (now - Date.parse(child.birth_date)) / (30.44 * DAY) : null
  if (ageM !== null && ageM >= 4.5 && !foods.length) suggested.push('When should we start solids, and which foods first?')
  const newFoods = foods.filter((f) => f.first >= since)
  if (newFoods.length) changes.push({ label: 'New foods', text: newFoods.map((f) => f.name).join(', ') })
  const done = skillsDone(mine, child.id)
  const newSkills = [...done].filter(([, e]) => Date.parse(e.started_at) >= since).map(([id]) => SKILLS.find((s) => s.id === id)?.label).filter(Boolean) as string[]
  if (newSkills.length) changes.push({ label: 'New skills', text: newSkills.slice(0, 6).join('; ') })
  if (now7.longest > 0 && now7.longest < 4 * H && ageM !== null && ageM >= 4) suggested.push(`Her longest sleep is about ${hm(now7.longest)}. Is that usual for her age?`)
  suggested.push('Anything we should watch for before the next visit?')
  return { lastVisit, since, changes, suggested }
}

/** The brief and questions as plain text, to share with the doctor or the family. */
export function visitText(name: string, b: VisitBrief, questions: Question[], tz: string, now: number): string {
  const lines = [`${name}: for the doctor, ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(now)}`]
  lines.push(b.lastVisit ? `Since the last visit on ${shortDate(Date.parse(b.lastVisit.started_at), tz)}:` : 'The last few weeks:')
  for (const c of b.changes) lines.push(`• ${c.label}: ${c.text}`)
  if (questions.length) {
    lines.push('', 'Questions:')
    for (const q of questions) lines.push(`• ${q.text}${q.answer ? `\n  → ${q.answer}` : ''}`)
  }
  return lines.join('\n')
}
