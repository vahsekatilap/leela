// Run with: npx tsx tests/visit.test.ts
// The doctor visit helper: what changed since the last visit, and suggested questions.
import assert from 'node:assert/strict'
import { visitBrief, visitText } from '../src/lib/visit'

const TZ = 'Asia/Kolkata'
const at = (d: string, hhmm: string) => `2026-11-${d}T${hhmm}:00+05:30`
let n = 0
const ev = (type: string, start: string, data: Record<string, unknown> = {}, end: string | null = null, notes: string | null = null) =>
  ({ id: `e${++n}`, family_id: 'f', child_id: 'c', type, started_at: new Date(start).toISOString(), ended_at: end && new Date(end).toISOString(), timer_state: null, deleted_at: null, data, notes, photo_paths: [], created_by: 'u', updated_by: 'u', created_at: '', updated_at: '' }) as never
const child = { id: 'c', family_id: 'f', name: 'Leela', birth_date: '2026-07-22', settings: { supplements: [{ id: 'vitd', name: 'Vitamin D' }] } } as never
const events = [
  ev('growth', at('01', '10:00'), { weight_kg: 5.6 }),
  ev('symptom', at('02', '11:00'), { kind: 'visit' }),
  ev('growth', at('20', '10:00'), { weight_kg: 6.2, length_cm: 62 }),
  ev('temperature', at('10', '20:00'), { temp_c: 38.3 }),
  ev('medicine', at('10', '20:05'), { name: 'Calpol', dose: '2.5', unit: 'ml' }),
]
for (let d = 15; d <= 21; d++) {
  const dd = String(d)
  events.push(ev('sleep', at(dd, '21:00'), {}, `2026-11-${String(d + 1).padStart(2, '0')}T03:00:00+05:30`))
  for (const h of ['06', '09', '12', '15', '18']) events.push(ev('nursing', at(dd, `${h}:00`)), ev('diaper', at(dd, `${h}:30`), { kind: 'wet' }))
}
const b = visitBrief(events, child, Date.parse(at('22', '10:00')), TZ)
assert.equal(b.lastVisit !== null, true)
const w = b.changes.find((c) => c.label === 'Weight')!
assert.match(w.text, /6\.2 kg on 20 Nov, \+600 g in 19 days \(about 221 g a week\)/)
assert.ok(b.changes.some((c) => c.label === 'Medicines' && /Calpol ×1/.test(c.text)))
assert.ok(b.suggested.some((s) => /38\.3 °C/.test(s)))
assert.ok(b.suggested.some((s) => /Vitamin D/.test(s)))
assert.ok(b.changes.some((c) => c.label === 'Feeds' && /^4\.7 a day/.test(c.text)))
const text = visitText('Leela', b, [{ id: 'q', text: 'Is she on track?', answer: 'Yes' }], TZ, Date.parse(at('22', '10:00')))
assert.match(text, /Since the last visit on 2 Nov/)
assert.match(text, /→ Yes/)
console.log('visit: all good')
