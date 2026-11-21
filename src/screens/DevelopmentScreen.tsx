import clsx from 'clsx'
import { Check } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { LogSheet } from '../components/LogSheet'
import { Overlay } from '../components/Overlay'
import { Panel } from '../components/history/bits'
import { deleteEvent, logEvent } from '../lib/actions'
import { AREAS, SKILLS, ageMonthsAt, devPlan, skillsDone, type Skill } from '../lib/development'
import { activeChild, useLeela } from '../lib/store'
import { fmtShortDate } from '../lib/time'
import type { LeelaEvent } from '../lib/types'

/** Skills most babies have by each age: tick them off as they happen, and they become Firsts. */
export function DevelopmentScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const family = useLeela((s) => s.family)!
  const eventsMap = useLeela((s) => s.events)
  const toast = useLeela((s) => s.toast)
  const child = activeChild()
  const [edit, setEdit] = useState<LeelaEvent | null>(null)
  const [showAll, setShowAll] = useState(false)
  const tz = family.timezone
  const done = useMemo(() => (child ? skillsDone(Object.values(eventsMap), child.id) : new Map<string, LeelaEvent>()), [eventsMap, child])
  if (!child) return null
  const months = child.birth_date ? ageMonthsAt(child.birth_date, Date.now()) : 0
  const plan = devPlan(done, months)

  const tick = async (k: Skill) => {
    const e = done.get(k.id)
    if (e) return setEdit(e)
    const made = await logEvent({ type: 'milestone', childId: child.id, data: { label: k.label, dev: k.id } }, { quiet: true })
    toast({ text: 'Saved as a First, dated today. Tap it to change the date.', action: { label: 'Undo', run: () => void deleteEvent(made.id, { quiet: true }) } })
  }
  const row = (k: Skill) => {
    const e = done.get(k.id)
    return (
      <li key={k.id}>
        <button type="button" onClick={() => void tick(k)} aria-pressed={Boolean(e)} className="flex w-full items-center gap-3 rounded-2xl bg-card-2 px-3 py-3 text-left">
          <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full ring-2', e ? 'text-white ring-transparent' : 'ring-line')} style={e ? { background: 'var(--milestone)' } : undefined}>
            {e && <Check size={16} weight="bold" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-snug">{k.label}</span>
            <span className="block text-[12.5px] text-ink-3">
              {AREAS[k.area]}
              {e ? ` · ${fmtShortDate(e.started_at, tz)}` : ''}
            </span>
          </span>
        </button>
      </li>
    )
  }
  const bands = [...new Set(SKILLS.map((k) => k.by))]

  return (
    <>
      <Overlay open={open} onClose={onClose} title="Development">
        <p className="mb-4 px-1 text-[15px] leading-snug text-ink-2">
          What most babies do by each age (the CDC’s checklists: about 3 in 4 babies do these by then). Tap one when {child.name} does it and it’s saved as a First. Every baby has her own pace.
        </p>
        {showAll ? (
          bands.map((b) => (
            <Panel key={b} title={b < 24 ? `By ${b} months` : 'By 2 years'}>
              <ul className="space-y-2">{SKILLS.filter((k) => k.by === b).map(row)}</ul>
            </Panel>
          ))
        ) : (
          <>
            {plan.now.length > 0 && (
              <Panel title={`Around now · ${plan.now.length} to look for`}>
                <ul className="space-y-2">{plan.now.map(row)}</ul>
                {plan.now.some((k) => k.by <= months - 2) && (
                  <p className="mt-2 text-[13px] leading-snug text-ink-3">Not seen some from an earlier age yet? Often they’re just not logged. If you’re unsure, mention them at the next check-up.</p>
                )}
              </Panel>
            )}
            {plan.next.length > 0 && (
              <Panel title={`Coming next, by ${plan.nextBy} months`}>
                <ul className="space-y-2">{plan.next.map(row)}</ul>
              </Panel>
            )}
            {done.size > 0 && (
              <Panel title={`Done · ${done.size}`}>
                <ul className="space-y-2">{SKILLS.filter((k) => done.has(k.id)).map(row)}</ul>
              </Panel>
            )}
          </>
        )}
        <button type="button" onClick={() => setShowAll(!showAll)} className="mb-2 min-h-11 w-full rounded-2xl bg-card text-[15px] font-semibold ring-1 ring-line">
          {showAll ? 'Show around now' : 'See every age, up to 2 years'}
        </button>
      </Overlay>
      {edit && <LogSheet open onClose={() => setEdit(null)} type="milestone" edit={edit} />}
    </>
  )
}
