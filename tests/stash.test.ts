// Run with: npx tsx tests/stash.test.ts
// The milk stash, the 24-hour pumping plan, today's goal and routines.
import assert from 'node:assert/strict'
import { pumpPlan, readAlerts, stashText, vitaminsLeft } from '../src/lib/alerts'
import { pumpTarget, sitting, sittingPrompt } from '../src/lib/pumping'
import { habits, late, notYet } from '../src/lib/routine'
import { milkStash, stashExpiring } from '../src/lib/stash'
import { feedNudge, nappyNudge, pumpLongGapNudge, pumpNudge, routineNudges, vitaminsNudge } from '../src/lib/nudges'

const TZ = 'Asia/Kolkata'
const at = (d: string, hhmm: string) => Date.parse(`2026-11-${d}T${hhmm}:00+05:30`)
let n = 0
const ev = (type: string, start: number, end: number | null, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: `e${++n}`, type, child_id: type === 'pump' ? null : 'c', started_at: new Date(start).toISOString(), ended_at: end === null ? null : new Date(end).toISOString(), timer_state: null, deleted_at: null, data, ...extra,
})

// ---------------------------------------------------------------- stash
{
  const a = ev('pump', at('15', '08:00'), at('15', '08:20'), { left_ml: 60, right_ml: 40, stash: 'fridge' })
  const b = ev('pump', at('16', '08:00'), at('16', '08:20'), { left_ml: 50, stash: 'freezer' })
  const c = ev('pump', at('17', '08:00'), at('17', '08:20'), { right_ml: 70, stash: 'fridge' })
  const fedNow = ev('pump', at('17', '12:00'), at('17', '12:20'), { left_ml: 30, stash: 'fed' })
  // Bottles: one fresh (doesn't count), one not said (fridge first, oldest), one from the freezer.
  const fresh = ev('bottle', at('17', '13:00'), null, { contents: 'breast', amount_ml: 30, stash: 'fresh' })
  const auto = ev('bottle', at('17', '15:00'), null, { contents: 'breast', amount_ml: 120 })
  const frz = ev('bottle', at('18', '10:00'), null, { contents: 'breast', amount_ml: 20, stash: 'freezer' })
  const formula = ev('bottle', at('18', '11:00'), null, { contents: 'formula', amount_ml: 90 })
  const s = milkStash([a, b, c, fedNow, fresh, auto, frz, formula], at('18', '12:00'))
  // 100 (a) + 70 (c) in the fridge, less 120 oldest first: a gone, c has 50.
  assert.equal(s.fridgeMl, 50)
  assert.equal(s.freezerMl, 30)
  assert.equal(s.lots.length, 2)
  assert.equal(s.usedWeek.bottles, 2)
  assert.equal(s.usedWeek.ml, 140)
  // c reaches 4 days in the fridge on the 21st at 8:20.
  const fridge = s.lots.find((l) => l.place === 'fridge')!
  assert.equal(fridge.useBy, at('21', '08:20'))
  assert.equal(stashExpiring([a, b, c, fedNow, fresh, auto, frz], at('20', '21:00')).length, 1)
  assert.equal(stashExpiring([a, b, c, fedNow, fresh, auto, frz], at('20', '12:00')).length, 0)
  // Thrown away: gone from then on.
  const gone = { ...c, data: { ...c.data, stash_gone_at: new Date(at('19', '09:00')).toISOString() } }
  assert.equal(milkStash([a, b, gone, auto], at('19', '10:00')).fridgeMl, 0)
  // Milk past its 4 days isn't taken by a bottle that didn't say where from.
  const old = ev('pump', at('10', '08:00'), at('10', '08:20'), { left_ml: 80, stash: 'fridge' })
  const later = ev('bottle', at('16', '09:00'), null, { contents: 'breast', amount_ml: 60 })
  assert.equal(milkStash([old, later], at('16', '10:00')).usedWeek.bottles, 0)
  assert.match(stashText(fridge, TZ).title, /8:20 AM/)
}

// ---------------------------------------------------------------- 24-hour plan
{
  const events = []
  // Each side every 4 hours, alternating two hours apart, for a week.
  for (let d = 14; d <= 20; d++)
    for (let h = 0; h < 24; h += 2) {
      const side = (h / 2) % 2 === 0 ? 'left_ml' : 'right_ml'
      const s = Date.parse(`2026-11-${d}T${String(h).padStart(2, '0')}:00:00+05:30`)
      events.push(ev('pump', s, s + 20 * 60_000, { [side]: 40 }))
    }
  const plan = pumpPlan(events as never, at('20', '22:30'), TZ)
  assert.ok(plan.length >= 8, `plan has ${plan.length}`)
  assert.ok(plan.every((x, i) => i === 0 || x.at >= plan[i - 1].at))
  assert.ok(plan[0].at >= at('20', '22:30'))
  // Alternating sides, not both at once.
  assert.notEqual(plan[0].side, plan[1].side)
  assert.ok(plan[plan.length - 1].at <= at('21', '22:30'))
}

// ---------------------------------------------------------------- today's goal
{
  const startOf = (t: number) => {
    const d = new Date(t + 5.5 * 3_600_000)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 5.5 * 3_600_000
  }
  const events = []
  for (let d = 10; d <= 20; d++) {
    for (const h of ['07', '13', '19']) events.push(ev('pump', at(String(d), `${h}:00`), at(String(d), `${h}:15`), { left_ml: 35, right_ml: 35 }))
  }
  events.push(ev('pump', at('21', '07:00'), at('21', '07:15'), { left_ml: 40, right_ml: 40 }))
  const t = pumpTarget(events as never, at('21', '10:00'), TZ, startOf)!
  assert.equal(t.target, 210)
  assert.equal(t.today, 80)
  assert.equal(t.byNow, 70)
  // Every earlier day was a usual one: the streak runs back to the first with a week before it.
  assert.ok(t.streak >= 7, `streak ${t.streak}`)
  assert.equal(t.hitToday, false)
  const s = sitting(events as never, at('21', '10:00'))
  assert.equal(s.usualMin, 15)
  assert.equal(s.minutes, 15)
  assert.match(sittingPrompt(0.5, s), /photo/)
  assert.match(sittingPrompt(16, s), /15 minutes/)
}

// ---------------------------------------------------------------- routines
{
  const events = []
  for (let d = 14; d <= 20; d++) events.push(ev('activity', at(String(d), '10:00'), null, { kind: 'bath' }))
  for (let d = 18; d <= 20; d++) events.push(ev('activity', at(String(d), '16:00'), null, { kind: 'tummy' }))
  events.push(ev('activity', at('21', '09:30'), null, { kind: 'tummy' }))
  const hs = habits(events as never, 'c', (e) => (e.type === 'activity' ? String(e.data.kind) : null), at('21', '12:00'), TZ)
  const bath = hs.find((h) => h.key === 'bath')!
  assert.equal(bath.days, 7)
  assert.equal(bath.minute, 600)
  assert.equal(bath.doneToday, false)
  assert.deepEqual(notYet(hs).map((h) => h.key), ['bath'])
  assert.deepEqual(late(hs, at('21', '10:30'), TZ).map((h) => h.key), [])
  assert.deepEqual(late(hs, at('21', '11:30'), TZ).map((h) => h.key), ['bath'])
}

// ---------------------------------------------------------------- nudges: gentle words, Important for a real miss
{
  const events = []
  for (let d = 14; d <= 20; d++) events.push(ev('activity', at(String(d), '10:00'), null, { kind: 'bath' }))
  const gentle = routineNudges(events as never, 'c', 'Leela', at('21', '11:30'), TZ, '2026-11-21')
  assert.equal(gentle.length, 1)
  assert.equal(gentle[0].title, 'Bath time, whenever it suits')
  assert.doesNotMatch(gentle[0].body, /\b(missed|late|forgot)\b/i)
  // After an outing yesterday, the words say so.
  events.push(ev('activity', at('20', '17:00'), at('20', '19:00'), { kind: 'outing', where: "Nani's house" }))
  const soft = routineNudges(events as never, 'c', 'Leela', at('21', '11:30'), TZ, '2026-11-21')
  assert.match(soft[0].body, /visit to Nani's house made for a full day/)

  const pumps = []
  for (let d = 10; d <= 20; d++) for (const h of ['07', '11', '15', '19']) pumps.push(ev('pump', at(String(d), `${h}:00`), at(String(d), `${h}:15`), { left_ml: 25, right_ml: 25 }))
  const p = { side: 'left' as const, lastAt: at('20', '19:15'), everyMin: 225, dueAt: at('20', '23:00') }
  const n = pumpNudge(p, [...pumps, ...events] as never, 'c', at('21', '06:00'), TZ, 25)
  assert.match(n.body, /full day, so a longer stretch is only natural/)
  assert.match(n.body, /averaging 200 ml a day/)
  assert.match(n.body, /Best window: now until/)
  assert.equal(pumpLongGapNudge(p, at('21', '06:00'), TZ), null) // before 7 am
  assert.equal(pumpLongGapNudge(p, at('21', '08:00'), TZ)?.important, true)

  const feed = { at: at('21', '12:00'), last: at('21', '09:00'), everyMin: 180, range: [at('21', '11:40'), at('21', '12:30')] as [number, number], basis: 'logs' }
  assert.equal(feedNudge(feed, 120, 'Leela', [] as never, 'c', at('21', '12:45'), TZ), null)
  assert.equal(feedNudge(feed, 120, 'Leela', [] as never, 'c', at('21', '13:10'), TZ)?.title, 'Maybe time for a feed')
  assert.equal(feedNudge(feed, 120, 'Leela', [] as never, 'c', at('21', '13:45'), TZ)?.important, true)

  const nappies = []
  for (let d = 14; d <= 21; d++) for (const h of ['06', '09', '12', '15', '18', '21']) nappies.push(ev('diaper', at(String(d), `${h}:00`), null, { kind: 'wet' }))
  const wet = nappies.filter((e) => Date.parse(e.started_at) <= at('21', '12:00'))
  assert.equal(nappyNudge(wet as never, 'c', 'Leela', 120, at('21', '17:00'), TZ), null)
  assert.equal(nappyNudge(wet as never, 'c', 'Leela', 120, at('21', '18:30'), TZ)?.important, true)
  assert.equal(nappyNudge(wet.slice(-10) as never, 'c', 'Leela', 120, at('21', '18:30'), TZ), null) // not logged closely enough

  assert.equal(vitaminsNudge('Leela', ['Vitamin D'], [], 'x')?.important, undefined)
  assert.equal(vitaminsNudge('Leela', ['Vitamin D'], ['Vitamin D'], 'x')?.title, 'Important: Vitamin D')
  assert.equal(vitaminsNudge('Leela', [], ['Vitamin D'], 'x'), null)
}

// ---------------------------------------------------------------- vitamin courses
{
  const settings = { supplements: [{ id: 'd', name: 'Vitamin D', from: '2026-07-21', until: '2027-07-21' }, { id: 'i', name: 'Iron', from: '2026-11-15', until: '2026-12-14' }] }
  const midnight = (d: string) => Date.parse(`${d}T00:00:00+05:30`)
  assert.deepEqual(vitaminsLeft(settings, [], 'c', midnight('2026-12-01'), midnight('2026-12-01') + 3_600_000), ['Vitamin D', 'Iron'])
  assert.deepEqual(vitaminsLeft(settings, [], 'c', midnight('2026-12-15'), midnight('2026-12-15') + 3_600_000), ['Vitamin D'])
  assert.deepEqual(vitaminsLeft(settings, [], 'c', midnight('2026-11-10'), midnight('2026-11-10') + 3_600_000), ['Vitamin D'])
}

assert.equal(readAlerts({}).stash, true)
console.log('stash, plan, goal and routine tests passed')
