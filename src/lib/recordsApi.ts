// Asking lap-tell (Ghar) and saving what it understood: the parts of "Add records" that need the
// network. The rest is in records.ts.
import { commitImport } from './import/save'
import type { Draft } from './import/parse'
import { parseUnderstood, schemaText, type Understood } from './records'
import { supabase } from './supabase'
import { readSupplements } from './supplements'
import { dayKey } from './time'
import type { Child } from './types'

const GHAR_TELL = 'https://sfjzdkajewcrcqzbpyou.supabase.co/functions/v1/lap-tell'

export async function understandAll(text: string, child: Child, tz: string): Promise<Understood> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in again, then try once more.')
  const res = await fetch(GHAR_TELL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      mode: 'records',
      text: text.slice(0, 3000),
      today: dayKey(Date.now(), tz),
      now: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(Date.now()),
      birth: child.birth_date,
      name: child.name,
      schema: schemaText(child),
      supplements: readSupplements(child.settings).map((s) => ({ name: s.name, dose: s.dose, unit: s.unit, from: s.from, until: s.until })),
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { records?: unknown[]; changes?: unknown[]; reply?: string; error?: string }
  if (!res.ok) throw new Error(body.error === 'busy' ? 'LAPdiary is busy understanding others right now. Try again in a minute.' : 'Couldn’t understand that just now. Try again in a moment.')
  return parseUnderstood(body)
}

export async function saveRecords(drafts: Draft[], childId: string, words: string): Promise<number> {
  if (!drafts.length) return 0
  const res = await commitImport({ drafts, childId, fileName: `Added by voice or text: ${words.slice(0, 120)}`, reader: 'text' })
  return res.saved
}
