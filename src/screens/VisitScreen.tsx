import { Check, Plus, ShareNetwork, Stethoscope, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Overlay } from '../components/Overlay'
import { Panel } from '../components/history/bits'
import { Button, TextArea } from '../components/ui'
import { logEvent, saveChildSettings } from '../lib/actions'
import { activeChild, useLeela } from '../lib/store'
import { loadAllHistory } from '../lib/sync'
import { readQuestions, visitBrief, visitText, type Question } from '../lib/visit'

/**
 * The doctor visit helper (More › Health, Settings › Care): what has changed since the last visit,
 * questions to ask (suggested from the logs, and the family's own, shared by both parents), the
 * doctor's answers during the visit, then one tap to share it or save the visit.
 */
export function VisitScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const family = useLeela((s) => s.family)!
  const eventsMap = useLeela((s) => s.events)
  const set = useLeela((s) => s.set)
  const child = activeChild()
  const tz = family.timezone
  const [typing, setTyping] = useState('')
  useEffect(() => {
    if (open) void loadAllHistory()
  }, [open])
  const now = Date.now()
  const brief = useMemo(() => (open && child ? visitBrief(Object.values(eventsMap), child, Date.now(), tz) : null), [open, eventsMap, child, tz])
  if (!child || !brief) return <Overlay open={open} onClose={onClose} title="Doctor visit">{null}</Overlay>

  const questions = readQuestions(child.settings)
  const save = (qs: Question[]) => void saveChildSettings(child.id, 'visit', { ...((child.settings?.visit as Record<string, unknown>) ?? {}), questions: qs })
  const add = (text: string) => {
    const t = text.trim()
    if (!t || questions.some((q) => q.text.toLowerCase() === t.toLowerCase())) return
    save([...questions, { id: `q${Date.now()}`, text: t }])
  }
  const suggestions = brief.suggested.filter((s) => !questions.some((q) => q.text === s))
  const share = async () => {
    const text = visitText(child.name, brief, questions, tz, now)
    try {
      if (navigator.share) await navigator.share({ title: `${child.name}: doctor visit`, text })
      else {
        await navigator.clipboard.writeText(text)
        useLeela.getState().toast({ text: 'Copied: paste it into a message' })
      }
    } catch {
      /* closed the share sheet */
    }
  }
  const finish = async () => {
    const qa = questions.map((q) => `${q.text}${q.answer ? `\n→ ${q.answer}` : ''}`).join('\n\n')
    await logEvent({ type: 'symptom', childId: child.id, notes: qa || undefined, data: { kind: 'visit' } })
    save([])
    useLeela.getState().toast({ text: 'Visit saved, with the answers' })
  }
  const last = brief.lastVisit ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: tz }).format(Date.parse(brief.lastVisit.started_at)) : null

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Doctor visit"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => void share()}>
            <ShareNetwork size={20} weight="bold" className="mr-1.5 inline" aria-hidden="true" /> Share
          </Button>
          <Button tone="health" onClick={() => void finish()}>
            <Check size={20} weight="bold" className="mr-1.5 inline" aria-hidden="true" /> Visit done
          </Button>
        </div>
      }
    >
      <section className="mb-4 flex gap-3 rounded-[26px] bg-[var(--health-soft)] p-4">
        <Stethoscope size={26} weight="duotone" className="mt-0.5 shrink-0 text-[var(--health)]" aria-hidden="true" />
        <p className="text-[15px] leading-snug">
          {last ? `Since the last visit on ${last}` : 'The last few weeks'}, in short, and what to ask. Fill in the doctor’s answers as you go; “Visit done” saves it all to History.
        </p>
      </section>

      <Panel title={last ? 'Since the last visit' : 'Lately'}>
        {brief.changes.length ? (
          <dl className="space-y-2.5">
            {brief.changes.map((c) => (
              <div key={c.label}>
                <dt className="text-[13px] font-semibold text-ink-2">{c.label}</dt>
                <dd className="text-[16px] leading-snug">{c.text}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[15px] text-ink-2">Not much logged yet. Growth, sleep, feeds and health entries show here.</p>
        )}
        <button type="button" onClick={() => set({ overlay: { kind: 'report', from: brief.since, to: now } })} className="mt-3 min-h-10 text-[15px] font-semibold text-brand">
          Full doctor report for these dates ›
        </button>
      </Panel>

      <Panel title={`Questions to ask${questions.length ? ` · ${questions.length}` : ''}`}>
        {questions.length > 0 && (
          <ol className="mb-3 space-y-3">
            {questions.map((q) => (
              <li key={q.id} className="rounded-2xl bg-card-2 p-3">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-[16px] font-semibold leading-snug">{q.text}</p>
                  <button type="button" onClick={() => save(questions.filter((x) => x.id !== q.id))} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card" aria-label="Remove this question">
                    <X size={15} weight="bold" />
                  </button>
                </div>
                <Answer value={q.answer ?? ''} onSave={(a) => save(questions.map((x) => (x.id === q.id ? { ...x, answer: a || undefined } : x)))} />
              </li>
            ))}
          </ol>
        )}
        {suggestions.length > 0 && (
          <>
            <p className="mb-1.5 text-[14px] font-semibold text-ink-2">Suggested from her logs: tap to add</p>
            <ul className="mb-3 space-y-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => add(s)} className="flex w-full items-start gap-2 rounded-2xl bg-card-2 px-3 py-2.5 text-left text-[15px] leading-snug ring-1 ring-line">
                    <Plus size={16} weight="bold" className="mt-0.5 shrink-0 text-brand" aria-hidden="true" /> {s}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <TextArea label="Your own question" value={typing} onChange={setTyping} rows={2} />
        <Button
          variant="secondary"
          size="md"
          className="w-full"
          disabled={!typing.trim()}
          onClick={() => {
            add(typing)
            setTyping('')
          }}
        >
          Add the question
        </Button>
        <p className="mt-2 text-[13px] text-ink-3">Both of you see the same list, so either can add to it before the visit.</p>
      </Panel>
    </Overlay>
  )
}

/** The doctor's answer to one question: a small box that saves when you leave it. */
function Answer({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [open, setOpen] = useState(Boolean(value))
  useEffect(() => setV(value), [value])
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-9 text-[14px] font-semibold text-brand">
        Add the doctor’s answer
      </button>
    )
  return (
    <textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== value && onSave(v.trim())}
      rows={2}
      placeholder="What the doctor said"
      className="mt-2 w-full rounded-xl bg-card px-3 py-2 text-[15px] ring-1 ring-line outline-none focus:ring-[var(--health)]"
      aria-label="The doctor’s answer"
    />
  )
}
