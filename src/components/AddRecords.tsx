import clsx from 'clsx'
import { Check, Microphone, Sparkle, Stop } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TYPES } from '../lib/config'
import { eventDetail, eventTitle } from '../lib/describe'
import { planRecords, type RecordChange, type Understood } from '../lib/records'
import { saveRecords, understandAll } from '../lib/recordsApi'
import { activeChild, myPrefs, useLeela } from '../lib/store'
import { loadAllHistory } from '../lib/sync'
import { applyChange, missingDays, type CourseChange } from '../lib/tell'
import type { LeelaEvent } from '../lib/types'
import { TypeIcon } from './Icon'
import { Button } from './ui'

const fmtDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const fmtLocal = (s: string) => {
  const [d, t] = s.split('T')
  const [h, mi] = t.split(':').map(Number)
  return `${fmtDay(d)}, ${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

type Rec = { start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; lang: string; interimResults: boolean; continuous: boolean }
type SpeechCtor = new () => Rec
const speechCtor = (): SpeechCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/**
 * Add records by voice or text: a box with a mic. Anything said in the family's own words (past
 * feeds, naps, weights, vaccines, firsts, a bath every evening since birth, vitamin courses) is
 * shown back as entries to add; nothing changes until Apply. Used in Settings › Records and above
 * "Bring in past logs".
 */
export function AddRecords({ compact = false }: { compact?: boolean }) {
  const family = useLeela((s) => s.family)!
  const eventsMap = useLeela((s) => s.events)
  const segments = useLeela((s) => s.segments)
  const toast = useLeela((s) => s.toast)
  const child = activeChild()
  const tz = family.timezone
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Understood | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  const [listening, setListening] = useState(false)
  const rec = useRef<Rec | null>(null)
  const base = useRef('')
  useEffect(() => {
    void loadAllHistory()
    return () => rec.current?.stop()
  }, [])
  const events = useMemo(() => Object.values(eventsMap), [eventsMap])
  const plan = useMemo(() => (result && child ? planRecords(result.records, events, child.id, tz, text.trim()) : null), [result, events, child, tz]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!child) return null
  const Speech = speechCtor()

  const listen = () => {
    if (!Speech) return
    if (listening) {
      rec.current?.stop()
      return
    }
    const r = new Speech()
    r.lang = 'en-IN'
    r.interimResults = true
    r.continuous = true
    base.current = text ? `${text.trim()} ` : ''
    r.onresult = (e) => {
      let said = ''
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript
      setText(base.current + said)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    setListening(true)
    r.start()
  }

  const go = async () => {
    rec.current?.stop()
    setBusy(true)
    setError(null)
    setResult(null)
    setDone({})
    try {
      setResult(await understandAll(text, child, tz))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t understand that just now.')
    } finally {
      setBusy(false)
    }
  }
  const saveEntries = async () => {
    if (!plan) return
    setDone((d) => ({ ...d, entries: 'saving' }))
    try {
      const n = await saveRecords(plan.drafts, child.id, text.trim())
      setDone((d) => ({ ...d, entries: `${n} ${n === 1 ? 'entry' : 'entries'} added.` }))
      toast({ text: `${n} ${n === 1 ? 'entry' : 'entries'} added.` })
    } catch (e) {
      setDone((d) => ({ ...d, entries: '' }))
      setError(e instanceof Error ? e.message : 'Couldn’t save those.')
    }
  }
  const saveCourse = async (c: CourseChange, i: number) => {
    setDone((d) => ({ ...d, [`c${i}`]: 'saving' }))
    try {
      const { added } = await applyChange(c, child, events, tz, text.trim())
      setDone((d) => ({ ...d, [`c${i}`]: added ? `Saved, and ${added} past ${added === 1 ? 'day' : 'days'} filled in.` : 'Saved.' }))
    } catch (e) {
      setDone((d) => ({ ...d, [`c${i}`]: '' }))
      setError(e instanceof Error ? e.message : 'Couldn’t save that.')
    }
  }

  return (
    <div>
      {!compact && (
        <p className="mb-3 px-1 text-[15px] leading-snug text-ink-2">
          Say or type anything that happened, in your own words. For example: “She weighed 6.2 kg at the doctor on 20 November.” “Bath every evening at 7 since 1 August.” “Vitamin D since 21 July, every day, till her first birthday.”
        </p>
      )}
      <div className="relative mb-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={compact ? 3 : 5}
          placeholder="Tap the mic and speak, or type here"
          className="w-full rounded-2xl bg-card px-4 py-3 pr-16 text-[16px] leading-snug ring-1 ring-line outline-none focus:ring-brand"
          aria-label="What to add"
        />
        {Speech && (
          <button
            type="button"
            onClick={listen}
            className={clsx('absolute right-3 bottom-4 grid h-12 w-12 place-items-center rounded-full', listening ? 'bg-[var(--feed)] text-white' : 'bg-card-2 text-brand ring-1 ring-line')}
            aria-label={listening ? 'Stop listening' : 'Speak'}
          >
            {listening ? <Stop size={22} weight="fill" /> : <Microphone size={24} weight="fill" />}
          </button>
        )}
      </div>
      {listening && <p className="-mt-1 mb-3 px-1 text-[14px] font-semibold text-[var(--feed)]">Listening… tap the square when done.</p>}
      <Button className="mb-2 w-full" size={compact ? 'md' : undefined} onClick={() => void go()} disabled={busy || text.trim().length < 6}>
        <Sparkle size={20} weight="fill" className="mr-1.5 inline" aria-hidden="true" /> {busy ? 'Understanding…' : 'Show me what it adds'}
      </Button>
      <p className="mb-4 px-1 text-[13px] text-ink-3">Nothing changes until you tap Apply. What you write is read by Google’s AI (through Ghar) to understand it.</p>

      {error && <p className="mb-4 rounded-2xl bg-[var(--feed-soft)] px-4 py-3 text-[15px]">{error}</p>}

      {result && (
        <section aria-label="What LAPdiary understood" className="space-y-3">
          {result.records.length > 0 && plan && (
            <div className="rounded-[22px] bg-card p-4 shadow-lift">
              <p className="font-display text-[18px] font-bold">Entries to add</p>
              <ul className="mt-2 space-y-2">
                {result.records.map((r, i) => (
                  <RecordRow key={i} r={r} n={plan.drafts.filter((d) => d.key.startsWith(`say-${i}-`)).length} family={family} segments={Object.values(segments)} />
                ))}
              </ul>
              {plan.skipped > 0 && <p className="mt-2 text-[14px] text-ink-2">{plan.skipped} already in LAPdiary, so left out.</p>}
              {done.entries && done.entries !== 'saving' ? (
                <p className="mt-3 flex items-center gap-1.5 text-[15px] font-semibold text-[var(--growth)]">
                  <Check size={18} weight="bold" aria-hidden="true" /> {done.entries}
                </p>
              ) : (
                <Button className="mt-3 w-full" onClick={() => void saveEntries()} disabled={done.entries === 'saving' || !plan.drafts.length}>
                  {done.entries === 'saving' ? 'Adding…' : plan.drafts.length ? `Apply: add ${plan.drafts.length} ${plan.drafts.length === 1 ? 'entry' : 'entries'}` : 'Nothing new to add'}
                </Button>
              )}
            </div>
          )}
          {result.courses.map((c, i) => {
            const days = missingDays(c, events, child.id, tz, Date.now())
            const state = done[`c${i}`]
            return (
              <div key={i} className="rounded-[22px] bg-card p-4 shadow-lift">
                <p className="font-display text-[18px] font-bold leading-tight">
                  {c.name}
                  {c.dose ? <span className="font-normal text-ink-2"> · {[c.dose, c.unit].filter(Boolean).join(' ')}</span> : null}
                </p>
                <ul className="mt-2 space-y-1 text-[15px] leading-snug">
                  {c.from && <li>Started {fmtDay(c.from)}</li>}
                  {c.until ? <li>Until {fmtDay(c.until)}{c.untilWords ? ` (${c.untilWords})` : ''}; no reminders after that</li> : <li>No end date: reminders carry on</li>}
                  {c.dailySince && <li>{days.length ? `Fill in ${days.length} past ${days.length === 1 ? 'day' : 'days'} with no entry, at the usual time` : 'Every past day is already logged'}</li>}
                </ul>
                {state && state !== 'saving' ? (
                  <p className="mt-3 flex items-center gap-1.5 text-[15px] font-semibold text-[var(--growth)]">
                    <Check size={18} weight="bold" aria-hidden="true" /> {state}
                  </p>
                ) : (
                  <Button tone="health" className="mt-3 w-full" onClick={() => void saveCourse(c, i)} disabled={state === 'saving'}>
                    {state === 'saving' ? 'Saving…' : 'Apply'}
                  </Button>
                )}
              </div>
            )
          })}
          {!result.records.length && !result.courses.length && <p className="rounded-2xl bg-card-2 px-4 py-3 text-[15px]">{result.reply || 'I couldn’t find anything to add in that. Try saying what happened and when.'}</p>}
          {(result.records.length > 0 || result.courses.length > 0) && result.reply && <p className="px-1 text-[14px] text-ink-2">{result.reply}</p>}
          {Object.values(done).some((v) => v && v !== 'saving') && <p className="px-1 text-[13px] text-ink-3">Added entries can be undone together from Settings › Records › Past logs and data.</p>}
        </section>
      )}
    </div>
  )
}

function RecordRow({ r, n, family, segments }: { r: RecordChange; n: number; family: NonNullable<ReturnType<typeof useLeela.getState>['family']>; segments: Parameters<typeof eventDetail>[1] }) {
  const fake = {
    id: 'x',
    family_id: family.id,
    child_id: null,
    type: r.type,
    started_at: new Date().toISOString(),
    ended_at: r.end ? new Date(Date.now() + 1).toISOString() : null,
    timer_state: null,
    data: r.data,
    photo_paths: [],
    notes: r.notes ?? null,
    source: 'import',
    import_id: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  } as LeelaEvent
  const detail = eventDetail(fake, segments, myPrefs(), Date.now(), { noLength: true })
  const when = r.repeat ? `Every day, ${fmtDay(r.repeat.from)} – ${fmtDay(r.repeat.until)}${r.repeat.time ? ` at ${fmtLocal(`2000-01-01T${r.repeat.time}`).split(', ')[1]}` : ''}` : `${fmtLocal(r.start)}${r.end ? ` – ${fmtLocal(r.end).split(', ')[1]}` : ''}`
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-card-2 px-3 py-2.5">
      <span className="mt-0.5 shrink-0" style={{ color: `var(--${TYPES[r.type].tone})` }}>
        <TypeIcon type={r.type} kind={typeof r.data.kind === 'string' ? r.data.kind : undefined} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-snug">{eventTitle(fake, family)}</span>
        {detail && <span className="block text-[14px] text-ink-2">{detail}</span>}
        <span className="block text-[13px] text-ink-2">
          {when}
          {r.repeat ? ` · ${n} new` : n === 0 ? ' · already logged' : ''}
        </span>
      </span>
    </li>
  )
}
