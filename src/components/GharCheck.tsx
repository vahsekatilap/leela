import { Check, PencilSimple, Trash } from '@phosphor-icons/react'
import { deleteEvent, editEvent } from '../lib/actions'
import { eventDetail, eventTitle } from '../lib/describe'
import { gharName, myPrefs, useLeela } from '../lib/store'
import { fmtTime } from '../lib/time'
import type { LeelaEvent } from '../lib/types'

/** Entries logged from Ghar (family away, nanny) show at once but wait here
 *  until Keshav or Nida look at them: Approve, Fix or Remove, or approve all. */
export function needsGharCheck(e: LeelaEvent): boolean {
  return !e.deleted_at && !!(e.data as { ghar_check?: unknown } | null)?.ghar_check
}

function approved(e: LeelaEvent) {
  const data = { ...(e.data ?? {}) } as Record<string, unknown>
  delete data.ghar_check
  return editEvent(e.id, { data: data as LeelaEvent['data'] })
}

export function GharCheck({ events, now, onFix }: { events: LeelaEvent[]; now: number; onFix: (e: LeelaEvent) => void }) {
  const family = useLeela((s) => s.family)
  const segments = useLeela((s) => s.segments)
  const items = events.filter(needsGharCheck).sort((a, b) => b.started_at.localeCompare(a.started_at))
  if (!items.length || !family) return null
  const segs = Object.values(segments)
  const who = (e: LeelaEvent) => gharName(e) ?? (e.data as { ghar_check?: { by?: string } } | null)?.ghar_check?.by ?? 'Ghar'
  const names = [...new Set(items.map(who))]
  return (
    <section className="mb-4 rounded-[26px] bg-card p-4 shadow-lift" aria-labelledby="gharcheck-h">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 id="gharcheck-h" className="font-display text-[19px] font-bold leading-tight">
          From Ghar · to check
          <span className="block font-sans text-[14px] font-normal text-ink-2">
            {items.length} {items.length === 1 ? 'entry' : 'entries'} by {names.join(', ')}. They already count; approve, fix or remove.
          </span>
        </h2>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => void Promise.all(items.map(approved))}
            className="shrink-0 rounded-full bg-brand px-3 py-2 text-[14px] font-semibold text-white"
          >
            Approve all
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {items.slice(0, 12).map((e) => {
          const d = eventDetail(e, segs, myPrefs(), now)
          const what = (e.data as { ghar_check?: { what?: string } } | null)?.ghar_check?.what
          return (
            <li key={e.id} className="flex items-center gap-2 text-[15px]">
              <span className="num w-[62px] shrink-0 font-semibold text-ink-2">{fmtTime(e.started_at, family.timezone)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {eventTitle(e, family)}
                  {d ? `, ${d}` : ''}
                </span>
                <span className="block truncate text-[13px] text-ink-2">
                  {what === 'woke' ? 'Woke up, marked' : 'Logged'} by {who(e)}
                </span>
              </span>
              <button type="button" onClick={() => void approved(e)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white" aria-label="Approve">
                <Check size={16} weight="bold" />
              </button>
              <button type="button" onClick={() => onFix(e)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card-2" aria-label="Fix">
                <PencilSimple size={16} weight="bold" />
              </button>
              <button type="button" onClick={() => void deleteEvent(e.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card-2" aria-label="Remove">
                <Trash size={16} weight="bold" />
              </button>
            </li>
          )
        })}
        {items.length > 12 && <li className="text-[14px] text-ink-2">and {items.length - 12} more; Approve all covers them too</li>}
      </ul>
    </section>
  )
}
