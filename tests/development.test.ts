// Run with: npx tsx tests/development.test.ts
import assert from 'node:assert/strict'
import { SKILLS, ageMonthsAt, devPlan, skillsDone } from '../src/lib/development'

assert.equal(new Set(SKILLS.map((s) => s.id)).size, SKILLS.length, 'ids are unique')
const months = ageMonthsAt('2026-07-18', Date.parse('2026-11-21T12:00:00Z'))
assert.ok(months > 4 && months < 4.2)
const done = skillsDone(
  [{ id: 'm', type: 'milestone', child_id: 'c', deleted_at: null, started_at: '2026-10-01T00:00:00Z', data: { dev: 'coo' } } as never, { id: 'x', type: 'milestone', child_id: 'c', deleted_at: 'x', started_at: '2026-10-01T00:00:00Z', data: { dev: 'laughs' } } as never],
  'c',
)
assert.deepEqual([...done.keys()], ['coo'])
const plan = devPlan(done, months)
assert.ok(plan.now.every((s) => s.by <= 5) && !plan.now.some((s) => s.id === 'coo'))
assert.equal(plan.nextBy, 6)
assert.ok(plan.next.some((s) => s.id === 'rolls'))
console.log('development: all good')
