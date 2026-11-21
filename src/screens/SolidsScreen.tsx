import clsx from 'clsx'
import { BookOpen, Check, Drop, Heart, Lightbulb, Plus, Sparkle, Warning, X, YoutubeLogo } from '@phosphor-icons/react'
import { TZDate } from '@date-fns/tz'
import { useMemo, useState } from 'react'
import { LogSheet } from '../components/LogSheet'
import { Overlay } from '../components/Overlay'
import { Panel } from '../components/history/bits'
import { Button, TextArea, TextInput } from '../components/ui'
import { logEvent, saveChildSettings } from '../lib/actions'
import {
  ALLERGENS,
  GROUPS,
  IRON_RICH,
  READY_SIGNS,
  RECIPE_IDEAS,
  SAFETY,
  foodsTried,
  matchesFood,
  nextFood,
  readList,
  readRecipes,
  stageFor,
  watching,
  youtubeLink,
  type Food,
  type Group,
  type ListFood,
  type Recipe,
} from '../lib/solids'
import { activeChild, useLeela } from '../lib/store'
import { supabase } from '../lib/supabase'
import { dayLabel, dayStart, daysBetween, fmtLongDate, fmtTime } from '../lib/time'
import type { Child, EventData, LeelaEvent } from '../lib/types'

const GHAR_IDEAS = 'https://sfjzdkajewcrcqzbpyou.supabase.co/functions/v1/lap-ideas'
const DAY = 86_400_000

/**
 * Solids, opened by the Solids button: log a meal or water at the top, what to try next and other
 * suggestions for her age, the family's own foods list, recipes (ideas, their own, and AI ideas),
 * every food so far and the common allergens. Before 6 months: the countdown and readiness signs.
 */
export function SolidsScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sheet, setSheet] = useState<{ preset?: EventData; edit?: LeelaEvent } | null>(null)
  const family = useLeela((s) => s.family)!
  const eventsMap = useLeela((s) => s.events)
  const child = activeChild()
  const tz = family.timezone
  const now = Date.now()
  const all = useMemo(() => (open ? Object.values(eventsMap).filter((e) => !e.deleted_at) : []), [eventsMap, open])
  const foods = useMemo(() => (child && open ? foodsTried(all, child.id) : []), [all, child, open])
  if (!child) return null

  const birth = child.birth_date ? new TZDate(Number(child.birth_date.slice(0, 4)), Number(child.birth_date.slice(5, 7)) - 1 + 6, Number(child.birth_date.slice(8, 10)), tz).getTime() : null
  const daysTo6 = birth ? daysBetween(birth, now, tz) : null
  const started = foods.length > 0 || (daysTo6 !== null && daysTo6 <= 0)
  const months = child.birth_date ? Math.max(6, (now - Date.parse(child.birth_date)) / (30.44 * DAY)) : 6
  const stage = stageFor(months)
  const list = readList(child.settings)
  const solids = (child.settings?.solids as Record<string, unknown> | undefined) ?? {}
  const saveSolids = (patch: Record<string, unknown>) => void saveChildSettings(child.id, 'solids', { ...solids, ...patch })

  const today0 = dayStart(now, tz).getTime()
  const todays = all.filter((e) => e.type === 'solids' && e.child_id === child.id && Date.parse(e.started_at) >= today0)
  const meals = todays.filter((e) => !e.data.drink)
  const water = todays.filter((e) => e.data.drink === 'water')
  const waterMl = water.reduce((t, e) => t + (e.data.amount_ml ?? 0), 0)
  const next = nextFood(list, foods, now)
  const logFood = (name: string) => setSheet({ preset: { foods: [{ name, first: !foods.some((f) => matchesFood(name, f.name)) }] } })
  const logWater = (ml?: number) => void logEvent({ type: 'solids', childId: child.id, data: { drink: 'water', ...(ml ? { amount_ml: ml } : {}) } })
  const regulars = [...foods].sort((a, b) => b.times - a.times).slice(0, 6)

  return (
    <>
      <Overlay
        open={open}
        onClose={onClose}
        title="Solids"
        footer={
          <button type="button" onClick={() => setSheet({})} className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-semibold text-white" style={{ background: 'var(--feed)' }}>
            <Plus size={20} weight="bold" aria-hidden="true" /> Log a meal
          </button>
        }
      >
        {daysTo6 !== null && daysTo6 > 0 && (
          <section className="mb-4 rounded-[26px] bg-[var(--feed-soft)] p-4">
            <p className="font-display text-[20px] font-bold leading-tight">
              {child.name} turns 6 months {daysTo6 <= 1 ? 'tomorrow' : `in ${daysTo6} days`}
            </p>
            <p className="mt-1 text-[15px] leading-snug text-ink-2">
              {fmtLongDate(birth!, tz)}. India’s paediatricians (IAP) and the WHO advise starting solids at about 6 months, alongside breast milk; start when her doctor says. Until then, milk is all she needs, with no water.
            </p>
            <p className="mt-2 text-[14px] leading-snug text-ink-2">Good to have ready: a high chair she sits upright in, a soft baby spoon, an open or sippy cup, bibs. Set up the foods list below so it’s ready on day one.</p>
          </section>
        )}

        {started && (
          <section className="mb-4 rounded-[26px] bg-card p-4 shadow-lift" aria-label="Log">
            <p className="text-[13px] font-bold tracking-wide text-[var(--feed)] uppercase">Today</p>
            <p className="text-[17px] font-semibold">
              {meals.length} {meals.length === 1 ? 'meal' : 'meals'}
              <span className="font-normal text-ink-2"> · usual for her age {stage.meals[0]}–{stage.meals[1]}</span>
              {water.length > 0 && <span className="font-normal text-ink-2"> · water {waterMl ? `${waterMl} ml` : `${water.length}×`}</span>}
            </p>
            {(regulars.length > 0 || next.name) && (
              <>
                <p className="mt-3 mb-1.5 text-[14px] font-semibold text-ink-2">Tap a food to log a meal</p>
                <div className="flex flex-wrap gap-2">
                  {next.name && !(next.waitUntil && next.waitUntil > now) && (
                    <button type="button" onClick={() => logFood(next.name!)} className="min-h-10 rounded-full px-3.5 text-[15px] font-semibold text-white" style={{ background: 'var(--feed)' }}>
                      New: {next.name}
                    </button>
                  )}
                  {regulars.map((f) => (
                    <button key={f.name} type="button" onClick={() => logFood(f.name)} className="min-h-10 rounded-full bg-card-2 px-3.5 text-[15px] ring-1 ring-line">
                      {f.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="mt-3 mb-1.5 flex items-center gap-1.5 text-[14px] font-semibold text-ink-2">
              <Drop size={16} weight="fill" className="text-[var(--sleep)]" aria-hidden="true" /> Water
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'A few sips', ml: undefined },
                { label: '30 ml', ml: 30 },
                { label: '60 ml', ml: 60 },
              ].map((w) => (
                <button key={w.label} type="button" onClick={() => logWater(w.ml)} className="min-h-10 rounded-full bg-card-2 px-3.5 text-[15px] ring-1 ring-line">
                  {w.label}
                </button>
              ))}
            </div>
            {todays.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-2">
                {todays
                  .sort((a, b) => b.started_at.localeCompare(a.started_at))
                  .map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => setSheet({ edit: e })} className="flex min-h-9 w-full gap-3 text-left text-[15px]">
                        <span className="num w-[64px] shrink-0 text-ink-2">{fmtTime(e.started_at, tz)}</span>
                        <span className="min-w-0 truncate">{e.data.drink ? `Water${e.data.amount_ml ? `, ${e.data.amount_ml} ml` : ', a few sips'}` : (e.data.foods ?? []).map((f) => f.name).join(', ') || 'Meal'}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        {started && <Suggestions child={child} foods={foods} list={list} next={next} stage={stage} now={now} tz={tz} events={all} />}

        {(!started || (daysTo6 !== null && daysTo6 > -60)) && (
          <ReadySigns ready={new Set<string>(((solids.ready as string[] | undefined) ?? []).filter((x) => typeof x === 'string'))} onSave={(r) => saveSolids({ ready: r })} />
        )}

        <FoodsList list={list} foods={foods} onLog={started ? logFood : undefined} onSave={(l) => saveSolids({ list: l })} />

        <Recipes child={child} foods={foods} list={list} months={months} saved={readRecipes(child.settings)} onSave={(r) => saveSolids({ recipes: r })} />

        {foods.length > 0 && <FoodsTried foods={foods} tz={tz} now={now} />}
        <Allergens foods={foods} />

        <Panel title="Keeping her safe">
          <ul className="list-disc space-y-1 pl-5 text-[14px] leading-snug text-ink-2">
            {SAFETY.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-ink-3">General guidance (WHO, IAP), not medical advice. Her doctor knows her best.</p>
        </Panel>
      </Overlay>
      {sheet && <LogSheet key={sheet.edit?.id ?? 'new'} open onClose={() => setSheet(null)} type="solids" edit={sheet.edit} preset={sheet.preset} />}
    </>
  )
}

// ------------------------------------------------------------------------- suggestions
function Suggestions({ child, foods, list, next, stage, now, tz, events }: { child: Child; foods: Food[]; list: ListFood[]; next: ReturnType<typeof nextFood>; stage: ReturnType<typeof stageFor>; now: number; tz: string; events: LeelaEvent[] }) {
  const tips: { icon: 'idea' | 'watch' | 'good'; title: string; text: string }[] = []
  const watch = watching(foods, now)
  if (watch.length && next.waitUntil && next.waitUntil > now)
    tips.push({ icon: 'watch', title: `${watch.map((f) => f.name).join(', ')} ${watch.length === 1 ? 'is' : 'are'} new`, text: `Keep to foods she knows until ${dayLabel(next.waitUntil, tz, now).toLowerCase()}, so any reaction is easy to trace.${next.name ? ` Then try ${next.name.toLowerCase()}.` : ''}` })
  else if (next.name) tips.push({ icon: 'idea', title: `Try next: ${next.name}`, text: 'The next new food on your list. One new food at a time, in the morning, so you can watch for a reaction during the day.' })
  const last2 = events.filter((e) => e.type === 'solids' && e.child_id === child.id && !e.data.drink && Date.parse(e.started_at) > now - 2 * DAY)
  const iron = last2.some((e) => (e.data.foods ?? []).some((f) => IRON_RICH.test(f.name)))
  if (foods.length >= 2 && !iron) tips.push({ icon: 'idea', title: 'Something iron-rich today', text: 'From 6 months babies need more iron than milk gives. Ragi, dal, egg, rajma, spinach or fish, at least once a day.' })
  const tried = new Set(foods.flatMap((f) => f.allergens))
  const notYet = ALLERGENS.filter((a) => !tried.has(a.id) && ['egg', 'peanut', 'dairy', 'wheat'].includes(a.id))
  if (foods.length >= 5 && notYet.length)
    tips.push({ icon: 'idea', title: `Not tried yet: ${notYet.map((a) => a.label.toLowerCase()).join(', ')}`, text: 'Current advice is to introduce common allergens early and keep offering them a few times a week. Ask her doctor first if she has eczema.' })
  const disliked = foods.filter((f) => f.disliked > 0 && f.liked === 0 && f.times < 8)
  if (disliked.length) tips.push({ icon: 'good', title: `Keep offering ${disliked[0].name.toLowerCase()}`, text: 'Babies often need 8–10 tries before they accept a new taste. A small spoon alongside a favourite helps.' })
  tips.push({ icon: 'good', title: `At ${stage.label}`, text: `${stage.texture}. ${stage.amount}. ${stage.tip}` })
  if (list.length && list.every((l) => foods.some((f) => matchesFood(l.name, f.name)))) tips.unshift({ icon: 'good', title: 'Everything on your list, tried', text: 'Add new foods to the list below to keep the variety growing.' })
  return (
    <section className="mb-4 space-y-2" aria-label="Suggestions">
      {tips.map((t) => {
        const Icon = t.icon === 'watch' ? Warning : t.icon === 'good' ? Sparkle : Lightbulb
        return (
          <div key={t.title} className="flex gap-3 rounded-2xl bg-card px-4 py-3">
            <Icon size={22} weight="duotone" className="mt-0.5 shrink-0" style={{ color: t.icon === 'watch' ? 'var(--feed)' : t.icon === 'good' ? 'var(--growth)' : 'var(--feed)' }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[16px] font-semibold leading-snug">{t.title}</p>
              <p className="mt-0.5 text-[14px] leading-snug text-ink-2">{t.text}</p>
            </div>
          </div>
        )
      })}
    </section>
  )
}

function ReadySigns({ ready, onSave }: { ready: Set<string>; onSave: (r: string[]) => void }) {
  const toggle = (id: string) => {
    const next = new Set(ready)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSave([...next])
  }
  return (
    <Panel title="Signs she’s ready">
      <ul className="space-y-2">
        {READY_SIGNS.map((s) => {
          const on = ready.has(s.id)
          return (
            <li key={s.id}>
              <button type="button" onClick={() => toggle(s.id)} aria-pressed={on} className="flex w-full items-center gap-3 rounded-2xl bg-card-2 px-3 py-3 text-left">
                <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full ring-2', on ? 'text-white ring-transparent' : 'ring-line')} style={on ? { background: 'var(--feed)' } : undefined}>
                  {on && <Check size={16} weight="bold" />}
                </span>
                <span className="text-[15px] leading-snug">{s.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[13px] text-ink-3">Tap them as you see them; the family sees the same list.</p>
    </Panel>
  )
}

// ------------------------------------------------------------------------- her foods list
function FoodsList({ list, foods, onLog, onSave }: { list: ListFood[]; foods: Food[]; onLog?: (name: string) => void; onSave: (l: ListFood[]) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [group, setGroup] = useState<Group>('veg')
  const status = (l: ListFood) => foods.find((f) => matchesFood(l.name, f.name))
  const add = () => {
    const n = name.trim()
    if (!n || list.some((l) => l.name.toLowerCase() === n.toLowerCase())) return
    onSave([...list, { name: n, group }])
    setName('')
  }
  const triedN = list.filter((l) => status(l)).length
  return (
    <Panel
      title={`Our foods list · ${triedN} of ${list.length} tried`}
      aside={
        <button type="button" onClick={() => setEditing((v) => !v)} className="min-h-9 text-[15px] font-semibold text-[var(--feed)]">
          {editing ? 'Done' : 'Change'}
        </button>
      }
    >
      {GROUPS.map((g) => {
        const items = list.filter((l) => l.group === g.id)
        if (!items.length) return null
        return (
          <div key={g.id} className="mb-3">
            <p className="mb-1.5 text-[13px] font-semibold text-ink-2">{g.label}</p>
            <ul className="flex flex-wrap gap-2">
              {items.map((l) => {
                const f = status(l)
                return (
                  <li key={l.name}>
                    {editing ? (
                      <button type="button" onClick={() => onSave(list.filter((x) => x !== l))} className="flex min-h-10 items-center gap-1.5 rounded-full bg-card-2 px-3 text-[15px] ring-1 ring-line" aria-label={`Remove ${l.name}`}>
                        {l.name} <X size={14} weight="bold" aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onLog?.(l.name)}
                        disabled={!onLog}
                        className={clsx('flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[15px] ring-1', f ? 'bg-[var(--growth-soft)] ring-transparent' : 'bg-card-2 ring-line')}
                      >
                        {f && <Check size={14} weight="bold" className="text-[var(--growth)]" aria-hidden="true" />}
                        {l.name}
                        {f && f.liked > f.disliked && <Heart size={13} weight="fill" className="text-[var(--feed)]" aria-label="liked" />}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      {editing && (
        <div className="mt-2 border-t border-line pt-3">
          <TextInput label="Add a food" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chikoo" />
          <div className="mb-3 flex flex-wrap gap-2">
            {GROUPS.map((g) => (
              <button key={g.id} type="button" onClick={() => setGroup(g.id)} aria-pressed={group === g.id} className={clsx('min-h-9 rounded-full px-3 text-[14px] ring-1', group === g.id ? 'bg-[var(--feed)] font-semibold text-white ring-transparent' : 'bg-card-2 ring-line')}>
                {g.label}
              </button>
            ))}
          </div>
          <Button tone="feed" size="md" className="w-full" onClick={add} disabled={!name.trim()}>
            Add to the list
          </Button>
        </div>
      )}
      {!editing && <p className="mt-1 text-[13px] text-ink-3">The order is the order “Try next” follows. Ticked once logged; tap one to log a meal with it.</p>}
    </Panel>
  )
}

// ------------------------------------------------------------------------- recipes
function Recipes({ child, foods, list, months, saved, onSave }: { child: Child; foods: Food[]; list: ListFood[]; months: number; saved: Recipe[]; onSave: (r: Recipe[]) => void }) {
  const [tab, setTab] = useState<'ideas' | 'ours'>(saved.length ? 'ours' : 'ideas')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [ai, setAi] = useState<{ busy: boolean; error?: string; ideas: Recipe[] }>({ busy: false, ideas: [] })
  const isSaved = (r: Recipe) => saved.some((s) => s.id === r.id)
  const save = (r: Recipe) => onSave(isSaved(r) ? saved.filter((s) => s.id !== r.id) : [...saved, r])
  const ideas = [...ai.ideas, ...RECIPE_IDEAS.filter((r) => (r.from ?? 6) <= Math.max(7, months + 1))]

  const ask = async () => {
    setAi((a) => ({ ...a, busy: true, error: undefined }))
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sign in again to ask for ideas.')
      const res = await fetch(GHAR_IDEAS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          age_months: Math.round(months * 10) / 10,
          tried: foods.map((f) => f.name),
          liked: foods.filter((f) => f.liked > f.disliked).map((f) => f.name),
          disliked: foods.filter((f) => f.disliked > f.liked).map((f) => f.name),
          list: list.map((l) => l.name),
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { ideas?: Recipe[]; error?: string }
      if (!res.ok || !Array.isArray(body.ideas)) throw new Error(body.error === 'busy' ? 'The ideas service is busy; try again in a minute.' : 'Couldn’t get ideas just now. Try again later.')
      setAi({ busy: false, ideas: body.ideas.map((r, i) => ({ ...r, id: `ai-${Date.now()}-${i}`, source: 'ai' as const })) })
      setTab('ideas')
    } catch (e) {
      setAi((a) => ({ ...a, busy: false, error: e instanceof Error ? e.message : 'Couldn’t get ideas just now.' }))
    }
  }

  const shown = tab === 'ours' ? saved : ideas
  return (
    <Panel title="Recipes">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-card-2 p-1">
        {(['ideas', 'ours'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={clsx('min-h-10 rounded-xl text-[15px] font-semibold', tab === t ? 'bg-card shadow-lift' : 'text-ink-2')}>
            {t === 'ideas' ? 'Ideas' : `Ours${saved.length ? ` · ${saved.length}` : ''}`}
          </button>
        ))}
      </div>
      {tab === 'ideas' && (
        <Button variant="secondary" size="md" className="mb-3 w-full" onClick={() => void ask()} disabled={ai.busy}>
          <Sparkle size={18} weight="fill" className="mr-1.5 inline text-[var(--feed)]" aria-hidden="true" />
          {ai.busy ? 'Thinking of ideas…' : `New ideas for ${child.name} (AI)`}
        </Button>
      )}
      {ai.error && <p className="mb-3 text-[14px] text-[var(--feed)]">{ai.error}</p>}
      {tab === 'ours' && !saved.length && !adding && <p className="mb-3 text-[15px] text-ink-2">Save ideas you like, or add your own family recipes.</p>}
      <ul className="space-y-2">
        {shown.map((r) => (
          <RecipeCard key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} saved={isSaved(r)} onSave={() => save(r)} />
        ))}
      </ul>
      {tab === 'ours' &&
        (adding ? (
          <NewRecipe
            onDone={(r) => {
              if (r) onSave([...saved, r])
              setAdding(false)
            }}
          />
        ) : (
          <Button variant="secondary" size="md" className="mt-3 w-full" onClick={() => setAdding(true)}>
            <Plus size={18} weight="bold" className="mr-1.5 inline" aria-hidden="true" /> Add our own recipe
          </Button>
        ))}
      {tab === 'ideas' && <p className="mt-2 text-[13px] text-ink-3">AI ideas use the foods she has tried and her age; check them like any recipe. No salt, sugar or honey before 1 year.</p>}
    </Panel>
  )
}

function RecipeCard({ r, open, onToggle, saved, onSave }: { r: Recipe; open: boolean; onToggle: () => void; saved: boolean; onSave: () => void }) {
  return (
    <li className="rounded-2xl bg-card-2">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left">
        <BookOpen size={20} weight="duotone" className="shrink-0 text-[var(--feed)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold leading-snug">{r.title}</span>
          <span className="block text-[13px] text-ink-2">
            {r.from ? `From ${r.from} months` : ''}
            {r.source === 'ai' ? `${r.from ? ' · ' : ''}AI idea` : ''}
            {r.source === 'own' ? 'Our recipe' : ''}
          </span>
        </span>
        {saved && <Heart size={16} weight="fill" className="shrink-0 text-[var(--feed)]" aria-label="saved" />}
      </button>
      {open && (
        <div className="px-3 pb-3 text-[15px] leading-snug">
          {r.note && <p className="mb-2 text-ink-2">{r.note}</p>}
          {r.ingredients.length > 0 && (
            <ul className="mb-2 list-disc pl-5">
              {r.ingredients.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          <ol className="mb-3 list-decimal space-y-1 pl-5">
            {r.steps.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <a href={r.link || youtubeLink(r.title)} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-1.5 rounded-full bg-card px-3.5 text-[15px] font-semibold">
              <YoutubeLogo size={18} weight="fill" className="text-[#ff0033]" aria-hidden="true" /> {r.link && !/youtube|youtu\.be/.test(r.link) ? 'Open the link' : 'Watch on YouTube'}
            </a>
            <button type="button" onClick={onSave} className="flex min-h-10 items-center gap-1.5 rounded-full bg-card px-3.5 text-[15px] font-semibold">
              <Heart size={16} weight={saved ? 'fill' : 'bold'} className="text-[var(--feed)]" aria-hidden="true" /> {saved ? (r.source === 'own' ? 'Delete' : 'Saved') : 'Save'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function NewRecipe({ onDone }: { onDone: (r: Recipe | null) => void }) {
  const [title, setTitle] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [steps, setSteps] = useState('')
  const [link, setLink] = useState('')
  const lines = (s: string) =>
    s
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
  return (
    <div className="mt-3 rounded-2xl bg-card-2 p-3">
      <TextInput label="Name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Nani’s ragi kheer" />
      <TextArea label="Ingredients (one a line)" value={ingredients} onChange={setIngredients} rows={3} />
      <TextArea label="Steps (one a line)" value={steps} onChange={setSteps} rows={4} />
      <TextInput label="Link (optional)" value={link} onChange={(e) => setLink(e.target.value)} placeholder="YouTube or a website" />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="md" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button
          tone="feed"
          size="md"
          disabled={!title.trim()}
          onClick={() => onDone({ id: `own-${Date.now()}`, title: title.trim(), ingredients: lines(ingredients), steps: lines(steps), link: /^https?:\/\//.test(link.trim()) ? link.trim() : undefined, source: 'own' })}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------- foods so far
function FoodsTried({ foods, tz, now }: { foods: Food[]; tz: string; now: number }) {
  return (
    <Panel title={`Foods tried · ${foods.length}`}>
      <ul className="divide-y divide-line">
        {foods.map((f) => (
          <li key={f.name} className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-semibold">
                {f.name}
                {f.allergens.length > 0 && <span className="ml-2 rounded-full bg-[var(--feed-soft)] px-2 text-[12px] font-semibold text-[var(--feed)]">allergen</span>}
              </span>
              <span className="block text-[13px] text-ink-2">
                First {dayLabel(f.first, tz, now).toLowerCase()}
                {f.times > 1 ? `, last ${dayLabel(f.last, tz, now).toLowerCase()}` : ''}
                {f.liked ? ` · liked ${f.liked}×` : ''}
                {f.disliked ? ` · not keen ${f.disliked}×` : ''}
              </span>
            </span>
            <span className="num shrink-0 text-[15px] font-semibold">{f.times}×</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function Allergens({ foods }: { foods: Food[] }) {
  const introduced = new Set(foods.flatMap((f) => f.allergens))
  return (
    <Panel title="Common allergens">
      <ul className="grid grid-cols-2 gap-2">
        {ALLERGENS.map((a) => {
          const on = introduced.has(a.id)
          return (
            <li key={a.id} className={clsx('flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[15px]', on ? 'bg-[var(--growth-soft)]' : 'bg-card-2')}>
              <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-full', on ? 'text-white' : 'ring-2 ring-line')} style={on ? { background: 'var(--growth)' } : undefined}>
                {on && <Check size={14} weight="bold" />}
              </span>
              {a.label}
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[13px] text-ink-3">Ticked when a food with it has been logged. Current advice is to introduce these early and keep offering them, one at a time; ask her doctor first if she has eczema or a known allergy.</p>
    </Panel>
  )
}
