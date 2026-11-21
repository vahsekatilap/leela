// The milk stash: pumped milk kept in the fridge or freezer, counted out by breast-milk bottles,
// oldest first. No libraries (bundled into the server's reminders too).
//
// - A pumping goes into the stash when its entry says `data.stash` = 'fridge' or 'freezer'.
// - A breast-milk bottle takes from the stash: from the place it names (`data.stash`), from
//   nowhere when it says 'fresh', and when it says nothing (older entries, Ghar) from the fridge
//   and then the freezer if they had milk then, oldest first, skipping milk that was too old.
// - `data.stash_gone_at` marks pumped milk used up or thrown away from then on.
// Keeping times follow the CDC's guidance for healthy full-term babies: up to 4 days in the
// fridge, best within 6 months in the freezer (12 is acceptable).

const H = 3_600_000
const DAY = 24 * H

export type Place = 'fridge' | 'freezer'
export const KEEP_MS: Record<Place, number> = { fridge: 4 * DAY, freezer: 182 * DAY }

interface Ev {
  id: string
  type: string
  started_at: string
  ended_at: string | null
  timer_state: string | null
  deleted_at: string | null
  data: Record<string, unknown>
}

export interface Lot {
  id: string
  /** When it was pumped (the end of the session). */
  at: number
  place: Place
  ml: number
  left: number
  useBy: number
}

export interface Stash {
  lots: Lot[]
  fridgeMl: number
  freezerMl: number
  /** Breast-milk bottles counted out of the stash in the last 7 days, and their millilitres. */
  usedWeek: { bottles: number; ml: number }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const placeOf = (v: unknown): Place | null => (v === 'fridge' || v === 'freezer' ? v : null)

export function pumpMl(e: Ev): number {
  return num(e.data.left_ml) + num(e.data.right_ml) || num(e.data.total_ml)
}

export function milkStash(events: Ev[], now: number): Stash {
  type Step = { t: number; kind: 'in'; lot: Lot; goneAt: number | null } | { t: number; kind: 'out'; ml: number; from: Place | 'auto' }
  const steps: Step[] = []
  for (const e of events) {
    if (e.deleted_at || e.timer_state) continue
    if (e.type === 'pump') {
      const place = placeOf(e.data.stash)
      const ml = pumpMl(e)
      if (!place || !ml) continue
      const at = e.ended_at ? Date.parse(e.ended_at) : Date.parse(e.started_at)
      const gone = typeof e.data.stash_gone_at === 'string' ? Date.parse(e.data.stash_gone_at) : null
      steps.push({ t: at, kind: 'in', lot: { id: e.id, at, place, ml, left: ml, useBy: at + KEEP_MS[place] }, goneAt: gone })
    } else if (e.type === 'bottle' && e.data.contents === 'breast' && e.data.stash !== 'fresh') {
      const ml = num(e.data.amount_ml)
      if (!ml) continue
      steps.push({ t: Date.parse(e.started_at), kind: 'out', ml, from: placeOf(e.data.stash) ?? 'auto' })
    }
  }
  steps.sort((a, b) => a.t - b.t || (a.kind === 'in' ? -1 : 1))
  const lots: { lot: Lot; goneAt: number | null }[] = []
  let used = { bottles: 0, ml: 0 }
  for (const s of steps) {
    if (s.kind === 'in') {
      lots.push({ lot: s.lot, goneAt: s.goneAt })
      continue
    }
    const live = (p: Place, fresh: boolean) =>
      lots.filter((x) => x.lot.place === p && x.lot.left > 0 && (x.goneAt === null || x.goneAt > s.t) && (!fresh || x.lot.useBy > s.t)).sort((a, b) => a.lot.at - b.lot.at)
    const order: Place[] = s.from === 'auto' ? ['fridge', 'freezer'] : [s.from]
    // Milk still good comes first; when a place was named and only older milk is there, that's what was used.
    const pool = [...order.flatMap((p) => live(p, true)), ...(s.from === 'auto' ? [] : live(s.from, false).filter((x) => x.lot.useBy <= s.t))]
    let need = s.ml
    let took = 0
    for (const x of pool) {
      if (need <= 0) break
      const t = Math.min(need, x.lot.left)
      x.lot.left -= t
      need -= t
      took += t
    }
    if (took && s.t > now - 7 * DAY) used = { bottles: used.bottles + 1, ml: used.ml + took }
  }
  const out = lots.filter((x) => x.lot.left > 0 && (x.goneAt === null || x.goneAt > now)).map((x) => x.lot)
  out.sort((a, b) => a.useBy - b.useBy)
  const sum = (p: Place) => out.filter((l) => l.place === p).reduce((t, l) => t + l.left, 0)
  return { lots: out, fridgeMl: sum('fridge'), freezerMl: sum('freezer'), usedWeek: used }
}

/** Fridge milk that reaches its use-by within `withinMs` (and hasn't yet). */
export function stashExpiring(events: Ev[], now: number, withinMs = 12 * H): Lot[] {
  return milkStash(events, now).lots.filter((l) => l.place === 'fridge' && l.useBy > now && l.useBy - now <= withinMs)
}
