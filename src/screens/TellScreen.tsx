import clsx from 'clsx'
import { Check, Microphone, Sparkle, Stop } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Overlay } from '../components/Overlay'
import { Button } from '../components/ui'
import { activeChild, useLeela } from '../lib/store'
import { loadAllHistory } from '../lib/sync'
import { applyChange, missingDays, understand, type CourseChange, type Understood } from '../lib/tell'

const fmtDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

type Rec = { start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; lang: string; interimResults: boolean; continuous: boolean }

/**
 * Tell LAPdiary (Settings › Records, the Vitamins sheet): say or type what happened, in your own
 * words; LAPdiary shows what it understood (a vitamin's course, past days to fill in) and
 * changes nothing until Apply. Filled-in days are one import, undone from Past logs and data.
 */
export function TellScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const family = useLeela((s) => s.family)!
  const eventsMap = useLeela((s) => s.events)
  const toast = useLeela((s) => s.toast)
  const child = activeChild()
  const tz = family.timezone
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Understood | null>(null)
  const [applied, setApplied] = useState<Record<number, string>>({})
  const [listening, setListening] = useState(false)
  const rec = useRef<Rec | null>(null)
  const base = useRef('')
  useEffect(() => {
    if (open) void loadAllHistory()
    else rec.current?.stop()
  }, [open])
  if (!child) return null

  const Speech = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition
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
    setApplied({})
    try {
      setResult(await understand(text, child, tz))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t understand that just now.')
    } finally {
      setBusy(false)
    }
  }
  const events = Object.values(eventsMap)
  const apply = async (c: CourseChange, i: number) => {
    setApplied((a) => ({ ...a, [i]: 'saving' }))
    try {
      const { added } = await applyChange(c, child, events, tz, text.trim())
      setApplied((a) => ({ ...a, [i]: added ? `Saved, and ${added} past ${added === 1 ? 'day' : 'days'} filled in.` : 'Saved.' }))
      toast({ text: `${c.name} updated.` })
    } catch (e) {
      setApplied((a) => ({ ...a, [i]: '' }))
      setError(e instanceof Error ? e.message : 'Couldn’t save that.')
    }
  }

  return (
    <Overlay open={open} onClose={onClose} title="Tell LAPdiary">
      <p className="mb-3 px-1 text-[15px] leading-snug text-ink-2">
        Say or type what happened, in your own words. For example: “Vitamin D was started on 21 July when we came home, given every day, and continues till her first birthday. Iron started on 15 November, for one month.”
      </p>
      <div className="relative mb-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Tap the mic and speak, or type here"
          className="w-full rounded-2xl bg-card px-4 py-3 pr-16 text-[16px] leading-snug ring-1 ring-line outline-none focus:ring-brand"
          aria-label="What to tell LAPdiary"
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
      <Button className="mb-2 w-full" onClick={() => void go()} disabled={busy || text.trim().length < 6}>
        <Sparkle size={20} weight="fill" className="mr-1.5 inline" aria-hidden="true" /> {busy ? 'Understanding…' : 'Show me what changes'}
      </Button>
      <p className="mb-5 px-1 text-[13px] text-ink-3">Nothing changes until you tap Apply. What you write is read by Google’s AI (through Ghar) to understand it.</p>

      {error && <p className="mb-4 rounded-2xl bg-[var(--feed-soft)] px-4 py-3 text-[15px]">{error}</p>}

      {result && (
        <section aria-label="What LAPdiary understood" className="space-y-3">
          {result.changes.map((c, i) => {
            const days = missingDays(c, events, child.id, tz, Date.now())
            const state = applied[i]
            return (
              <div key={i} className="rounded-[22px] bg-card p-4 shadow-lift">
                <p className="font-display text-[19px] font-bold leading-tight">
                  {c.name}
                  {c.dose ? <span className="font-normal text-ink-2"> · {[c.dose, c.unit].filter(Boolean).join(' ')}</span> : null}
                </p>
                <ul className="mt-2 space-y-1 text-[15px] leading-snug">
                  {c.from && <li>Started {fmtDay(c.from)}</li>}
                  {c.until ? <li>Until {fmtDay(c.until)}{c.untilWords ? ` (${c.untilWords})` : ''}; no reminders after that</li> : <li>No end date: reminders carry on</li>}
                  {c.dailySince && <li>{days.length ? `Fill in ${days.length} past ${days.length === 1 ? 'day' : 'days'} with no entry, at her usual time` : 'Every past day is already logged'}</li>}
                </ul>
                {state && state !== 'saving' ? (
                  <p className="mt-3 flex items-center gap-1.5 text-[15px] font-semibold text-[var(--growth)]">
                    <Check size={18} weight="bold" aria-hidden="true" /> {state}
                  </p>
                ) : (
                  <Button tone="health" className="mt-3 w-full" onClick={() => void apply(c, i)} disabled={state === 'saving'}>
                    {state === 'saving' ? 'Saving…' : 'Apply'}
                  </Button>
                )}
              </div>
            )
          })}
          {!result.changes.length && <p className="rounded-2xl bg-card-2 px-4 py-3 text-[15px]">{result.reply || 'I couldn’t find anything to change in that. Try naming the vitamin and the dates.'}</p>}
          {result.changes.length > 0 && result.reply && <p className="px-1 text-[14px] text-ink-2">{result.reply}</p>}
          {Object.values(applied).some((v) => v.includes('filled in')) && <p className="px-1 text-[13px] text-ink-3">Filled-in days can be undone together from Settings › Records › Past logs and data.</p>}
        </section>
      )}
    </Overlay>
  )
}
