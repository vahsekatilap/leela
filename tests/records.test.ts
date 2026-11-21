// Run with: npx tsx tests/records.test.ts
// Add records by voice or text: what the AI said, turned into entries.
import assert from 'node:assert/strict'
import { draftsOf, parseUnderstood, planRecords, schemaText } from '../src/lib/records'

const TZ = 'Asia/Kolkata'
const now = Date.parse('2026-11-22T10:00:00+05:30')
const u = parseUnderstood({
  records: [
    { type: 'growth', start: '2026-11-20T11:00', data: { weight_kg: '6.2', colour: 'x' } },
    { type: 'activity', start: '2026-11-18T19:00', end: '2026-11-18T19:20', data: { kind: 'bath' }, repeat: { from: '2026-11-18', until: '2026-11-22', time: '19:00' } },
    { type: 'symptom', start: '2026-10-30T10:00', data: { kind: 'vaccine', vax: ['dtp3', 7] } },
    { type: 'nonsense', start: '2026-11-20T11:00', data: {} },
    { type: 'note', start: 'yesterday', data: {} },
    { type: 'sleep', start: '2026-11-23T10:00', data: {} },
  ],
  changes: [{ kind: 'supplement', name: 'Vitamin D', from: '2026-07-21', until: '2027-07-22', daily_since_from: true }],
  reply: 'ok',
})
assert.equal(u.records.length, 4)
assert.deepEqual(u.records[0].data, { weight_kg: 6.2 })
assert.deepEqual(u.records[2].data, { kind: 'vaccine', vax: ['dtp3'] })
assert.equal(u.courses[0].dailySince, true)
// A daily bath from the 18th, up to yesterday evening (today's 7 pm hasn't come yet), 20 minutes each.
const baths = draftsOf(u.records[1], TZ, now, 'w', 1)
assert.equal(baths.length, 4)
assert.equal(baths[0].end! - baths[0].start, 20 * 60_000)
// Never in the future.
assert.equal(draftsOf(u.records[3], TZ, now, 'w', 3).length, 0)
// Already logged: left out.
const existing = [{ id: 'a', family_id: 'f', child_id: 'c', type: 'activity', started_at: new Date(baths[0].start).toISOString(), ended_at: null, timer_state: null, data: { kind: 'bath' }, photo_paths: [], notes: null, source: 'app', import_id: null, created_by: 'u', updated_by: 'u', created_at: '', updated_at: '', deleted_at: null }] as never
const plan = planRecords([u.records[1]], existing, 'c', TZ, 'w')
assert.equal(plan.skipped, 1)
assert.equal(plan.drafts.length, 3)
assert.match(schemaText({ id: 'c', name: 'Leela', birth_date: '2026-07-22', settings: {} } as never), /growth \(Growth\): weight_kg/)
console.log('records: all good')
