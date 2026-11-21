import { Sparkle, X } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { feedNudge, nappyNudge, routineNudges, type Nudge } from '../lib/nudges'
import type { SweetSpot } from '../lib/sweetspot'
import type { Child, EventType, LeelaEvent } from '../lib/types'

const KEY = 'lap.nudges.dismissed'
const readDismissed = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(-60) : []
  } catch {
    return []
  }
}

export type NudgeAction = { type: EventType; kind?: string } | 'solids'

/** What a nudge's slot asks to log. */
function actionOf(slot: string): NudgeAction | null {
  const [, what] = slot.split('/')
  if (slot.startsWith('imp/nappy')) return { type: 'diaper' }
  if (what === 'feed') return { type: 'nursing' }
  if (what?.startsWith('bottle')) return { type: 'bottle' }
  if (what?.startsWith('meal')) return 'solids'
  if (slot.startsWith('late/')) return { type: 'activity', kind: what }
  return null
}

/**
 * The same nudges the phones get, on Today: gentle ones as a soft card, Important ones above it.
 * Each can be put away for today.
 */
export function NudgeCards({ events, child, spot, now, tz, onAct }: { events: LeelaEvent[]; child: Child; spot: SweetSpot; now: number; tz: string; onAct: (a: NudgeAction) => void }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const minute = Math.floor(now / 300_000)
  const list = useMemo(() => {
    const t = minute * 300_000
    const asleep = spot.status === 'napping' || spot.status === 'night'
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(t)
    const out: Nudge[] = []
    if (!asleep) {
      if (spot.feed && (spot.status === 'ok' || spot.status === 'newborn')) {
        const f = feedNudge(spot.feed as never, spot.ageDays, child.name, events as never, child.id, t, tz)
        if (f) out.push(f)
      }
      const n = nappyNudge(events as never, child.id, child.name, spot.ageDays, t, tz)
      if (n) out.push(n)
      out.push(...routineNudges(events as never, child.id, child.name, t, tz, day))
    }
    return out
  }, [events, child, spot, minute, tz])
  const shown = list.filter((n) => !dismissed.includes(n.slot))
  if (!shown.length) return null
  const hide = (slot: string) => {
    const next = [...dismissed, slot].slice(-60)
    setDismissed(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* private mode */
    }
  }
  return (
    <div className="mt-3 space-y-2">
      {shown.map((n) => {
        const act = actionOf(n.slot)
        return (
          <section key={n.slot} className="flex gap-3 rounded-[22px] px-4 py-3" style={{ background: n.important ? 'var(--feed-soft)' : 'var(--card)' }} aria-label={n.important ? 'Important' : 'A gentle nudge'}>
            {!n.important && <Sparkle size={20} weight="duotone" className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              {n.important && <p className="text-[12px] font-bold tracking-wide text-[var(--feed)] uppercase">Important</p>}
              <p className="text-[16px] font-semibold leading-snug">{n.important ? n.title.replace(/^Important: /, '') : n.title}</p>
              <p className="mt-0.5 text-[14px] leading-snug text-ink-2">{n.body}</p>
              {act && (
                <button type="button" onClick={() => onAct(act)} className="mt-1 min-h-9 text-[15px] font-semibold text-brand">
                  Log it ›
                </button>
              )}
            </div>
            <button type="button" onClick={() => hide(n.slot)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card-2" aria-label="Put away for today">
              <X size={15} weight="bold" />
            </button>
          </section>
        )
      })}
    </div>
  )
}
