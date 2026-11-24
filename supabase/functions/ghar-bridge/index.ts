// The doorway between Ghar (the family app) and Leela. Ghar never reads Leela's tables itself:
// it asks this function, and this function is the only place that knows both sides. Keep its
// requests and replies the same when Leela changes inside (see CLAUDE.md, "Ghar bridge").
//
// Who is asking: the caller sends their Ghar sign-in (Authorization) and Ghar's public key
// (x-ghar-apikey). This function asks Ghar's own database, as that person, who they are and
// whether they may see or log Leela (Ghar's leela_access()). Nothing private is shared between
// the two projects. Deploy with verify_jwt = false: the Ghar sign-in is checked here.
//
// Requests (POST, JSON):
//   { action: "status", days?: 1..14 }  -> { child, status, logs }
//      status also has (added 21 Nov 2026, older Ghar builds ignore them): wake_range [from, to],
//      pump { side, due_at, last_at, last_kind, expect_ml, other: { side, due_at } | null } | null,
//      vitamins { list: [name], left: [name] }
//      (added 22 Nov 2026) stash { fridge_ml, freezer_ml, oldest: { place, ml, use_by } | null },
//      nudges [{ title, body, important }]: the same gentle words and Important notes LAPdiary shows
//      (added 25 Nov 2026) feeding { kind: 'breast'|'bottle', since, side: 'left'|'right'|null, paused } | null:
//      a feed timer running in LAPdiary right now
//   { action: "log", kind: "sleep"|"wake"|"feed"|"nappy"|"note"|"activity"|"vitamin", at?, room?, detail? } -> { ok, id }
//      activity: detail "Massage", "Bath", "Tummy time", "Outing: <place>"; vitamin: detail = its name
//      feed: detail "Breast" | "Bottle" | "Formula" | "Solids", optionally "· 90 ml" and, for breast
//      milk, "· fridge" / "· freezer" / "· fresh" (where the milk came from, for the stash)
//   { action: "delete", id }            -> { ok }   (only entries that were logged from Ghar)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sweetSpot } from './sweetspot.js'
import { expectedMl, feedNudge, localMidnight, milkStash, nappyNudge, pumpDue, readStashCount, routineNudges, vitaminsLeft } from './alerts.js'

const GHAR_URL = 'https://sfjzdkajewcrcqzbpyou.supabase.co'
const DAY = 86_400_000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ghar-apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>

interface Access {
  household: string
  member: string
  name: string
  role: string
  can_see: boolean
  can_log: boolean
}

async function gharAccess(req: Request): Promise<Access | null> {
  const auth = req.headers.get('Authorization') ?? ''
  const key = req.headers.get('x-ghar-apikey') ?? ''
  if (!auth.startsWith('Bearer ') || !key) return null
  const res = await fetch(`${GHAR_URL}/rest/v1/rpc/leela_access`, {
    method: 'POST',
    headers: { apikey: key, Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) return null
  const a = await res.json()
  return a && typeof a === 'object' && a.household ? (a as Access) : null
}

function db() {
  const url = Deno.env.get('SUPABASE_URL')!
  let key: string | undefined
  try {
    key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default
  } catch { /* fall through */ }
  key ??= Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key!, { auth: { persistSession: false } })
}

const FEEDS = new Set(['nursing', 'bottle', 'solids'])
const ACTIVITY_LABELS: Record<string, string> = { bath: 'Bath', massage: 'Massage', tummy: 'Tummy time', outing: 'Outing', outdoor: 'Outdoor play', indoor: 'Indoor play', story: 'Story time', skin: 'Skin to skin', teeth: 'Brushing teeth', screen: 'Screen time' }

function feedDetail(e: Row): string {
  const d = e.data ?? {}
  if (e.type === 'nursing') return 'Breast'
  if (e.type === 'solids') return e.data?.drink ? 'Water' : 'Solids'
  const ml = typeof d.amount_ml === 'number' ? ` ${d.amount_ml} ml` : ''
  return (d.contents === 'formula' ? 'Formula' : 'Bottle') + ml
}

function nappyDetail(e: Row): string {
  const k = e.data?.kind
  return k === 'mixed' ? 'Both' : k === 'wet' ? 'Wet' : k === 'dirty' ? 'Dirty' : ''
}

function who(e: Row, names: Map<string, string>): string | null {
  return e.data?.ghar?.by ?? (e.created_by ? names.get(e.created_by) ?? null : null)
}

/** Leela entries as Ghar's simple log lines, newest first. */
function asGharLogs(events: Row[], names: Map<string, string>): Row[] {
  const out: Row[] = []
  for (const e of events) {
    const by = who(e, names)
    const room = e.data?.ghar?.room ?? null
    const fromGhar = !!e.data?.ghar
    const extra = [e.data?.ghar?.detail, e.notes].filter((s) => typeof s === 'string' && s.trim()).join(' · ')
    if (e.type === 'sleep') {
      out.push({ id: e.id, kind: 'sleep', at: e.started_at, room, detail: extra || null, by, from_ghar: fromGhar })
      if (e.ended_at) out.push({ id: `${e.id}:wake`, kind: 'wake', at: e.ended_at, room: null, detail: null, by, from_ghar: false })
    } else if (FEEDS.has(e.type)) {
      out.push({ id: e.id, kind: 'feed', at: e.started_at, room: null, detail: [feedDetail(e), extra].filter(Boolean).join(' · '), by, from_ghar: fromGhar })
    } else if (e.type === 'diaper') {
      out.push({ id: e.id, kind: 'nappy', at: e.started_at, room: null, detail: [nappyDetail(e), extra].filter(Boolean).join(' · ') || null, by, from_ghar: fromGhar })
    } else if (e.type === 'activity') {
      const d = e.data ?? {}
      const label = ACTIVITY_LABELS[d.kind] ?? d.label ?? 'Activity'
      const mins = e.ended_at ? Math.round((Date.parse(e.ended_at) - Date.parse(e.started_at)) / 60000) : 0
      const what = [d.kind === 'outing' && d.where ? `Outing: ${d.where}` : label, mins >= 1 ? `${mins} min` : '', extra].filter(Boolean).join(' · ')
      out.push({ id: e.id, kind: 'note', at: e.started_at, room: null, detail: what, by, from_ghar: fromGhar })
    } else if (e.type === 'note' || e.type === 'medicine' || e.type === 'symptom' || e.type === 'temperature') {
      const d = e.data ?? {}
      const label =
        e.type === 'note'
          ? ''
          : e.type === 'medicine' && d.supplement
            ? `Vitamin: ${d.name ?? ''}`.trim()
            : e.type === 'medicine'
            ? ['Medicine', [d.name, d.dose, d.dose ? d.unit : null].filter(Boolean).join(' ')].filter(Boolean).join(': ')
            : e.type === 'symptom' && d.kind === 'vaccine'
              ? ['Vaccine', d.vaccine].filter(Boolean).join(': ')
              : e.type === 'symptom' && d.kind === 'visit'
                ? 'Doctor visit'
                : e.type[0].toUpperCase() + e.type.slice(1)
      out.push({ id: e.id, kind: 'note', at: e.started_at, room: null, detail: [label, extra].filter(Boolean).join(' · ') || null, by, from_ghar: fromGhar })
    }
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

async function status(client: Row, link: Row, days: number) {
  const now = Date.now()
  const [{ data: child }, { data: family }] = await Promise.all([
    client.from('children').select('*').eq('id', link.child_id).single(),
    client.from('families').select('timezone, night_start, night_end').eq('id', link.family_id).single(),
  ])
  // Sweet spot learns from about a week; the list shows [days].
  const since = new Date(now - Math.max(days, 8) * DAY).toISOString()
  const { data: events } = await client
    .from('events')
    .select('*')
    .eq('family_id', link.family_id)
    .is('deleted_at', null)
    .or(`child_id.eq.${link.child_id},child_id.is.null`)
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(2000)
  const list = (events ?? []) as Row[]
  const { data: people } = await client.from('profiles').select('id, display_name')
  const names = new Map<string, string>((people ?? []).map((p: Row) => [p.id, p.display_name]))

  const mine = list.filter((e) => e.child_id === link.child_id)
  const running = mine.find((e) => e.type === 'sleep' && e.timer_state && !e.ended_at)
  const lastSleep = mine.find((e) => e.type === 'sleep')
  const lastFeed = mine.find((e) => FEEDS.has(e.type) && !e.data?.drink)
  // A breastfeed or bottle being timed in LAPdiary right now.
  const feeding = mine.find((e) => (e.type === 'nursing' || e.type === 'bottle') && e.timer_state && !e.ended_at)
  const lastNappy = mine.find((e) => e.type === 'diaper')
  let ss: Row | null = null
  try {
    ss = sweetSpot(mine as never, child as never, family as never, now) as Row
  } catch (err) {
    console.error('sweet spot', err)
  }
  const next = ss?.next
  const cutoff = now - days * DAY
  const tz = family?.timezone ?? 'UTC'
  let pump: Row | null = null
  try {
    const p = pumpDue(list as never, now, tz)
    if (p) {
      pump = {
        side: p.other ? p.side : null,
        due_at: new Date(p.dueAt).toISOString(),
        last_at: new Date(p.lastAt).toISOString(),
        last_kind: p.lastKind,
        expect_ml: expectedMl(list as never, p.side, p.dueAt, tz, now),
        other: p.other ? { side: p.other.side, due_at: new Date(p.other.dueAt).toISOString() } : null,
      }
    }
  } catch (err) {
    console.error('pump', err)
  }
  // The milk stash: pumped milk in the fridge (4 days) and freezer (6 months).
  let stash: Row | null = null
  try {
    const { data: milk } = await client
      .from('events')
      .select('id, type, started_at, ended_at, timer_state, deleted_at, data, child_id')
      .eq('family_id', link.family_id)
      .is('deleted_at', null)
      .in('type', ['pump', 'bottle'])
      .gte('started_at', new Date(now - 190 * DAY).toISOString())
      .limit(5000)
    const st = milkStash((milk ?? []) as never, now, readStashCount(child?.settings))
    if (st.lots.length) {
      const o = st.lots[0]
      stash = { fridge_ml: st.fridgeMl, freezer_ml: st.freezerMl, oldest: { place: o.place, ml: o.left, use_by: new Date(o.useBy).toISOString() } }
    }
  } catch (err) {
    console.error('stash', err)
  }
  // Gentle nudges and Important notes, as LAPdiary shows them (never while she sleeps).
  const nudges: Row[] = []
  try {
    if (!running && !feeding && child) {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
      const f = ss?.feed && (ss.status === 'ok' || ss.status === 'newborn') ? feedNudge(ss.feed as never, ss.ageDays, child.name, mine as never, link.child_id, now, tz) : null
      const n = nappyNudge(mine as never, link.child_id, child.name, ss?.ageDays ?? null, now, tz)
      for (const x of [f, n, ...routineNudges(mine as never, link.child_id, child.name, now, tz, day)]) if (x) nudges.push({ title: x.title, body: x.body, important: Boolean(x.important) })
    }
  } catch (err) {
    console.error('nudges', err)
  }
  // Only those on their course today (from / until, when the family set them).
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
  const supplements = Array.isArray(child?.settings?.supplements)
    ? (child.settings.supplements as Row[]).filter((x) => (typeof x?.from !== 'string' || x.from <= today) && (typeof x?.until !== 'string' || x.until >= today)).map((x) => String(x?.name ?? '')).filter(Boolean)
    : []
  const dayStart = localMidnight(now, tz)
  return {
    child: { name: child?.name ?? 'Baby', born: child?.birth_date ?? null },
    status: {
      asleep: !!running,
      since: running ? running.started_at : (lastSleep?.ended_at ?? null),
      room: running?.data?.ghar?.room ?? null,
      window_opens: next && !running ? new Date(next.start).toISOString() : null,
      window_closes: next && !running ? new Date(next.end).toISOString() : null,
      next_kind: next?.kind ?? null,
      wake_around: ss?.wakeAround ? new Date(ss.wakeAround).toISOString() : null,
      last_feed: lastFeed?.started_at ?? null,
      last_feed_detail: lastFeed ? feedDetail(lastFeed) : null,
      next_feed: ss?.feed?.at ? new Date(ss.feed.at).toISOString() : null,
      last_nappy: lastNappy?.started_at ?? null,
      sweet_spot: ss?.status ?? null,
      wake_range: ss?.wakeRange ? ss.wakeRange.map((t: number) => new Date(t).toISOString()) : null,
      pump,
      vitamins: supplements.length ? { list: supplements, left: vitaminsLeft(child?.settings, mine as never, link.child_id, dayStart, now + 60_000) } : null,
      stash,
      nudges,
      feeding: feeding
        ? {
          kind: feeding.type === 'nursing' ? 'breast' : 'bottle',
          since: feeding.started_at,
          side: feeding.type === 'nursing' ? (feeding.data?.last_side === 'right' ? 'right' : 'left') : null,
          paused: feeding.timer_state === 'paused',
        }
        : null,
    },
    logs: asGharLogs(mine.filter((e) => Date.parse(e.started_at) >= cutoff || (e.ended_at && Date.parse(e.ended_at) >= cutoff)), names).slice(0, 300),
  }
}

async function log(client: Row, link: Row, me: Access, body: Row) {
  const at = body.at && !Number.isNaN(Date.parse(body.at)) ? new Date(body.at).toISOString() : new Date().toISOString()
  const detail = typeof body.detail === 'string' ? body.detail.trim().slice(0, 500) : ''
  const ghar = { by: me.name, member: me.member, ...(body.room ? { room: String(body.room).slice(0, 60) } : {}) }
  const base = { family_id: link.family_id, child_id: link.child_id, created_by: null, updated_by: null }

  if (body.kind === 'wake') {
    const { data: running } = await client
      .from('events').select('id').eq('child_id', link.child_id).eq('type', 'sleep')
      .not('timer_state', 'is', null).is('deleted_at', null).limit(1)
    if (!running?.length) return { ok: true, note: 'not asleep' }
    const { error } = await client.rpc('timer_stop', { p_event_id: running[0].id, p_at: at })
    if (error) throw error
    // Waking from Ghar also waits for Keshav or Nida to check it in LAPdiary.
    const { data: cur } = await client.from('events').select('data').eq('id', running[0].id).single()
    await client.from('events').update({ data: { ...(cur?.data ?? {}), ghar_check: { by: me.name, what: 'woke' } } }).eq('id', running[0].id)
    return { ok: true, id: `${running[0].id}:wake` }
  }

  const id = crypto.randomUUID()
  let row: Row
  if (body.kind === 'sleep') {
    const { data: running } = await client
      .from('events').select('id').eq('child_id', link.child_id).eq('type', 'sleep')
      .not('timer_state', 'is', null).is('deleted_at', null).limit(1)
    if (running?.length) return { ok: true, id: running[0].id, note: 'already asleep' }
    row = { ...base, id, type: 'sleep', started_at: at, timer_state: 'running', data: { ghar: { ...ghar, detail: detail || undefined } } }
  } else if (body.kind === 'feed') {
    const d = detail.toLowerCase()
    const type = d.startsWith('breast') ? 'nursing' : d.startsWith('solid') ? 'solids' : 'bottle'
    const data: Row = { ghar: { ...ghar, detail: detail || undefined } }
    if (type === 'bottle') {
      data.contents = d.startsWith('formula') ? 'formula' : 'breast'
      const ml = d.match(/(\d{2,3})\s*ml/)
      if (ml) data.amount_ml = Number(ml[1])
      const from = d.match(/\b(fridge|freezer|fresh)\b/)
      if (from && data.contents === 'breast') data.stash = from[1]
    }
    row = { ...base, id, type, started_at: at, ended_at: at, data }
  } else if (body.kind === 'nappy') {
    const d = detail.toLowerCase()
    const kind = d.startsWith('both') ? 'mixed' : d.startsWith('wet') ? 'wet' : d.startsWith('dirty') ? 'dirty' : undefined
    row = { ...base, id, type: 'diaper', started_at: at, data: { ...(kind ? { kind } : {}), ghar: { ...ghar, detail: detail || undefined } } }
  } else if (body.kind === 'activity') {
    const d = detail.toLowerCase()
    const kind = d.startsWith('massage') ? 'massage' : d.startsWith('bath') ? 'bath' : d.startsWith('tummy') ? 'tummy' : d.startsWith('outing') ? 'outing' : undefined
    // "Outing · Nani's house · went by car": the first part says what, the rest is where and notes.
    const parts = detail.split(/\s*[·:]\s*/).filter(Boolean)
    const where = kind === 'outing' ? (parts[1] ?? '') : ''
    const rest = parts.slice(kind === 'outing' ? 2 : 1).join(' · ')
    row = { ...base, id, type: 'activity', started_at: at, data: { ...(kind ? { kind } : { label: parts[0] || 'Activity' }), ...(where ? { where } : {}), ghar: { ...ghar, ...(rest ? { detail: rest } : {}) } } }
  } else if (body.kind === 'vitamin') {
    if (!detail) return { ok: false, error: 'which vitamin?' }
    const { data: kid } = await client.from('children').select('settings').eq('id', link.child_id).single()
    const known = (Array.isArray(kid?.settings?.supplements) ? kid.settings.supplements : []).find((x: Row) => String(x?.name ?? '').toLowerCase() === detail.toLowerCase())
    row = { ...base, id, type: 'medicine', started_at: at, data: { name: known?.name ?? detail, ...(known?.dose ? { dose: known.dose, unit: known.unit } : {}), supplement: true, ghar } }
  } else if (body.kind === 'note') {
    if (!detail) return { ok: false, error: 'empty note' }
    row = { ...base, id, type: 'note', started_at: at, notes: detail, data: { ghar } }
  } else {
    return { ok: false, error: 'unknown kind' }
  }
  // Shows at once (timers and the sweet spot stay right) but waits in
  // LAPdiary's "From Ghar · to check" card until Keshav or Nida approve it.
  row.data = { ...(row.data ?? {}), ghar_check: { by: me.name, what: 'logged' } }
  const { error } = await client.from('events').insert(row)
  if (error) throw error
  return { ok: true, id }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405)
  try {
    const me = await gharAccess(req)
    if (!me || !me.can_see) return reply({ error: 'not allowed' }, 403)
    const body = (await req.json().catch(() => ({}))) as Row
    const client = db()
    const { data: link } = await client.from('ghar_links').select('*').eq('ghar_household', me.household).maybeSingle()
    if (!link) return reply({ error: 'not linked' }, 404)

    if (body.action === 'status') {
      const days = Math.min(14, Math.max(1, Number(body.days) || 3))
      return reply(await status(client, link, days))
    }
    if (!me.can_log) return reply({ error: 'not allowed to log' }, 403)
    if (body.action === 'log') return reply(await log(client, link, me, body))
    if (body.action === 'delete') {
      const id = String(body.id ?? '')
      if (id.endsWith(':wake')) {
        // Undo a wake-up: the sleep carries on.
        const sleepId = id.slice(0, -5)
        const { error } = await client.from('events')
          .update({ ended_at: null, timer_state: 'running' })
          .eq('id', sleepId).eq('family_id', link.family_id).eq('type', 'sleep')
        if (error) throw error
        return reply({ ok: true })
      }
      const { error } = await client.from('events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id).eq('family_id', link.family_id).not('data->ghar', 'is', null)
      if (error) throw error
      return reply({ ok: true })
    }
    return reply({ error: 'unknown action' }, 400)
  } catch (err) {
    console.error(err)
    return reply({ error: 'something went wrong' }, 500)
  }
})
