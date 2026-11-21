import { ArrowLeft, Baby, Bell, BookOpenText, CaretRight, ClockCounterClockwise, Copy, Crown, Drop, DownloadSimple, FileArrowUp, FileText, Folders, Microphone, Moon, PencilSimple, Plant, Plus, ShareNetwork, ShieldStar, Stethoscope, Syringe, UserCircle, UsersThree, X, Carrot } from '@phosphor-icons/react'
import { useState } from 'react'
import { AddRecords } from '../components/AddRecords'
import { ActivitySheet } from '../components/ActivitySheet'
import { AlertSettings } from '../components/AlertSettings'
import { ChildSheet } from '../components/ChildSheet'
import { ClockTimeField } from '../components/TimeField'
import { Sheet, useBackToClose } from '../components/Sheet'
import { Button, Choices, TextInput } from '../components/ui'
import { rpc, saveDisplayName, saveFamilySettings, savePrefs } from '../lib/actions'
import { MAX_FAMILY_MEMBERS } from '../lib/config'
import { myPrefs, useLeela } from '../lib/store'
import { supabase } from '../lib/supabase'
import { disableReminders } from '../lib/push'
import { bootstrap, refresh, teardown } from '../lib/sync'
import { getThemeMode, setThemeMode, type ThemeMode } from '../lib/theme'
import { forgetWord } from '../lib/import/learn'
import { exportFamilyData, saveBlob } from '../lib/export'
import { meaningById } from '../lib/import/vocab'
import { ageText } from '../lib/time'
import type { Child } from '../lib/types'
import type { RpcName } from '../lib/database.types'

declare const __APP_VERSION__: string

export function FamilyScreen() {
  const family = useLeela((s) => s.family)!
  const members = useLeela((s) => s.members)
  const profiles = useLeela((s) => s.profiles)
  const children = useLeela((s) => s.children)
  const userId = useLeela((s) => s.userId)
  const email = useLeela((s) => s.email)
  const toast = useLeela((s) => s.toast)
  const prefs = myPrefs()
  const [childSheet, setChildSheet] = useState<{ child?: Child } | null>(null)
  const [nameSheet, setNameSheet] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [theme, setTheme] = useState<ThemeMode>(getThemeMode())
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState(false)
  const [exporting, setExporting] = useState(false)
  // Settings opens as a short list; each row opens its page.
  const [page, setPage] = useState<Page | null>(null)
  useBackToClose(page !== null, () => {
    setPage(null)
    window.scrollTo({ top: 0 })
  })
  const go = (p: Page) => {
    setPage(p)
    window.scrollTo({ top: 0 })
  }
  const overlay = (kind: 'vaccines' | 'development' | 'solids' | 'pumping' | 'report' | 'book' | 'admin' | 'visit' | 'tell') => useLeela.getState().set({ overlay: { kind } })

  const download = async (kind: 'json' | 'csv') => {
    setExporting(true)
    try {
      const files = await exportFamilyData()
      saveBlob(kind === 'json' ? files.json : files.csv, `${files.baseName}.${kind}`)
      toast({ text: `Downloaded ${files.counts.entries} entries${kind === 'json' ? ` and ${files.counts.changes} activity records` : ''}.` })
    } catch (e) {
      toast({ text: `Couldn’t export: ${e instanceof Error ? e.message : 'unknown error'}`, tone: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const ownerId = family.owner_id && members.some((m) => m.user_id === family.owner_id) ? family.owner_id : members[0]?.user_id
  const iAmOwner = ownerId === userId
  const myName = userId ? profiles[userId]?.display_name ?? '' : ''
  const [nameDraft, setNameDraft] = useState(myName)
  const lastOne = members.length <= 1

  const share = async () => {
    const text = `Join our family on LAPdiary to log the baby’s day together. Our family code is ${family.code}.\n${window.location.origin}${window.location.pathname}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join our family on LAPdiary', text })
        return
      } catch {
        /* cancelled */
      }
    }
    await navigator.clipboard.writeText(text)
    toast({ text: 'Invite copied. Paste it into WhatsApp or a message.' })
  }

  const ownerAction = async (fn: RpcName, args: Record<string, unknown>, done: string) => {
    if (!navigator.onLine) {
      toast({ text: 'This needs a connection.', tone: 'error' })
      return
    }
    const res = await rpc(fn, args)
    if (!res.ok) toast({ text: `Couldn’t do that: ${res.error}`, tone: 'error' })
    else {
      toast({ text: done })
      await refresh()
    }
  }

  const leave = async () => {
    setBusy(true)
    // Reminders belong to the family being left.
    await disableReminders('left the family')
    const res = await rpc('leave_family', { p_confirm: lastOne ? confirmText.trim().toUpperCase() : null })
    setBusy(false)
    if (!res.ok) {
      toast({ text: res.error === 'confirm_required' ? 'Type DELETE to confirm.' : `Couldn’t leave: ${res.error}`, tone: 'error' })
      return
    }
    setLeaving(false)
    teardown()
    await bootstrap()
  }

  return (
    <div className="mx-auto max-w-[560px] px-5 pb-32">
      {page === null ? (
        <>
          <header className="safe-top pb-4">
            <h1 className="font-display text-[30px] font-extrabold leading-tight">Settings</h1>
            <p className="text-[15px] text-ink-2">{family.name || 'Family'} · {myName || email}</p>
          </header>
          <Rows
            title="Family"
            rows={[
              { icon: <UsersThree size={24} weight="duotone" />, label: 'Family and members', sub: `Code ${family.code} · ${members.length} of ${MAX_FAMILY_MEMBERS} members`, onClick: () => go('family') },
              { icon: <Baby size={24} weight="duotone" />, label: children.length === 1 ? children[0].name : 'Babies', sub: children.map((c) => (c.birth_date ? `${c.name}, ${ageText(c.birth_date)}` : c.name)).join(' · ') || 'Add a baby', onClick: () => go('babies') },
            ]}
          />
          <Rows
            title="Care"
            rows={[
              { icon: <Stethoscope size={24} weight="duotone" />, label: 'Doctor visit', sub: 'What’s changed, questions to ask, share', onClick: () => overlay('visit') },
              { icon: <Syringe size={24} weight="duotone" />, label: 'Vaccine schedule', sub: 'India’s IAP schedule, with reminders', onClick: () => overlay('vaccines') },
              { icon: <Plant size={24} weight="duotone" />, label: 'Development', sub: 'Skills to look for at her age', onClick: () => overlay('development') },
              { icon: <Carrot size={24} weight="duotone" />, label: 'Solids and foods', sub: 'Readiness, foods tried, allergens', onClick: () => overlay('solids') },
              { icon: <Drop size={24} weight="duotone" />, label: 'Pumping coach', sub: 'Yield, best times, what would help', onClick: () => overlay('pumping') },
            ]}
          />
          <Rows
            title="This phone"
            rows={[
              { icon: <Bell size={24} weight="duotone" />, label: 'Notifications', sub: 'What to be told, and when', onClick: () => go('alerts') },
              { icon: <Moon size={24} weight="duotone" />, label: 'Look and units', sub: `${theme === 'night' ? 'Warm night' : theme === 'day' ? 'Light' : 'Dark'} · ${prefs.temp === 'f' ? '°F' : '°C'} · ${prefs.length === 'in' ? 'inches' : 'cm'}`, onClick: () => go('display') },
            ]}
          />
          <Rows
            title="Records"
            rows={[
              { icon: <Microphone size={24} weight="duotone" />, label: 'Add records · voice or text', sub: 'Say what happened, in your own words', onClick: () => overlay('tell') },
              { icon: <FileText size={24} weight="duotone" />, label: 'Doctor report', sub: 'Any dates, ready to save as a PDF', onClick: () => overlay('report') },
              { icon: <BookOpenText size={24} weight="duotone" />, label: 'Diary book', sub: 'Month by month, to print or keep', onClick: () => overlay('book') },
              { icon: <Folders size={24} weight="duotone" />, label: 'Past logs and your data', sub: 'Import, download, activity, words learned', onClick: () => go('data') },
            ]}
          />
          <Rows
            title="Account"
            rows={[
              { icon: <UserCircle size={24} weight="duotone" />, label: 'Your account', sub: email ?? '', onClick: () => go('account') },
              ...(prefs.admin === true ? [{ icon: <ShieldStar size={24} weight="duotone" />, label: 'Admin', sub: 'Usage, growth charts and checks', onClick: () => overlay('admin') }] : []),
            ]}
          />
          <p className="mt-2 text-center text-[13px] text-ink-3">LAPdiary {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''}</p>
        </>
      ) : (
        <header className="safe-top flex items-center gap-2 pb-4">
          <button type="button" onClick={() => window.history.back()} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-card" aria-label="Back to Settings">
            <ArrowLeft size={22} weight="bold" />
          </button>
          <h1 className="font-display text-[26px] font-extrabold leading-tight">{PAGE_TITLES[page]}</h1>
        </header>
      )}

      {page === 'family' && (
        <>
      <section id="set-family" className="mb-6 scroll-mt-4 rounded-[28px] bg-card p-5 shadow-lift" aria-labelledby="code-h">
        <h2 id="code-h" className="text-[15px] font-semibold text-ink-2">
          Family code
        </h2>
        <p className="num mt-1 text-[30px] font-extrabold tracking-wide">{family.code}</p>
        <p className="mb-4 text-[14px] text-ink-2">Anyone who enters this once can see and log everything for your babies.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button size="md" onClick={() => void share()}>
            <ShareNetwork size={20} weight="bold" aria-hidden="true" /> Share
          </Button>
          <Button
            size="md"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(family.code)
              toast({ text: 'Code copied.' })
            }}
          >
            <Copy size={20} weight="bold" aria-hidden="true" /> Copy
          </Button>
        </div>
        {iAmOwner && (
          <button
            type="button"
            className="mt-4 text-[14px] font-semibold text-ink-2 underline underline-offset-4"
            onClick={() => {
              if (window.confirm('Reset the code? The old one stops working right away. Everyone already in the family stays in.')) {
                void ownerAction('reset_family_code', {}, 'New code ready. Share it with anyone new.')
              }
            }}
          >
            Reset code
          </button>
        )}
      </section>

      <Section title="Members">
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const p = profiles[m.user_id]
            const isMe = m.user_id === userId
            return (
              <li key={m.user_id} className="flex items-center gap-3 py-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card-2 font-display text-[18px] font-bold">
                  {(p?.display_name || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[16px] font-semibold">
                    <span className="truncate">{p?.display_name || 'Family member'}</span>
                    {isMe && <span className="text-[14px] font-normal text-ink-2">(you)</span>}
                    {m.user_id === ownerId && <Crown size={16} weight="fill" className="text-[var(--milestone)]" aria-label="Owner" />}
                  </span>
                </span>
                {isMe && (
                  <button type="button" onClick={() => setNameSheet(true)} className="grid h-10 w-10 place-items-center rounded-full bg-card-2" aria-label="Edit your name">
                    <PencilSimple size={18} weight="bold" />
                  </button>
                )}
                {iAmOwner && !isMe && (
                  <span className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (window.confirm(`Make ${p?.display_name || 'them'} the owner? They’ll be able to remove members and reset the code.`)) {
                          void ownerAction('transfer_ownership', { p_user_id: m.user_id }, 'Ownership handed over.')
                        }
                      }}
                    >
                      Make owner
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        if (window.confirm(`Remove ${p?.display_name || 'this member'}? They lose access right away.`)) {
                          void ownerAction('remove_member', { p_user_id: m.user_id }, 'Removed.')
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </Section>

        </>
      )}

      {page === 'babies' && (
      <Section id="set-babies" title="Babies">
        <ul className="divide-y divide-line">
          {children.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setChildSheet({ child: c })} className="flex w-full items-center gap-3 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold">{c.name}</span>
                  <span className="block text-[14px] text-ink-2">{c.birth_date ? ageText(c.birth_date) : 'Birth date not set'}</span>
                </span>
                <PencilSimple size={18} weight="bold" className="text-ink-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="md" className="mt-2 w-full" onClick={() => setChildSheet({})}>
          <Plus size={18} weight="bold" aria-hidden="true" /> Add a baby
        </Button>
      </Section>

      )}

      {page === 'alerts' && (
      <Section id="set-alerts" title="Notifications">
        <AlertSettings />
      </Section>
      )}

      {page === 'display' && (
      <Section id="set-display" title="Display and units">
        <div className="mb-4">
          <div className="mb-2 text-[15px] font-semibold text-ink-2">Length</div>
          <Choices
            options={[
              { id: 'cm', label: 'Centimetres' },
              { id: 'in', label: 'Inches' },
            ]}
            value={prefs.length === 'in' ? 'in' : 'cm'}
            onChange={(v) => void savePrefs({ length: v ?? 'cm' })}
            columns={2}
          />
        </div>
        <div className="mb-4">
          <div className="mb-2 text-[15px] font-semibold text-ink-2">Temperature</div>
          <Choices
            options={[
              { id: 'c', label: '°C' },
              { id: 'f', label: '°F' },
            ]}
            value={prefs.temp === 'f' ? 'f' : 'c'}
            onChange={(v) => void savePrefs({ temp: v ?? 'c' })}
            columns={2}
          />
        </div>
        <p className="mb-4 text-[14px] text-ink-2">Milk is always in ml and weight in kg.</p>
        <div className="mb-4">
          <div className="mb-2 text-[15px] font-semibold text-ink-2">Theme</div>
          <Choices
            options={[
              { id: 'dark', label: 'Dark' },
              { id: 'night', label: 'Warm night' },
              { id: 'day', label: 'Light' },
            ]}
            value={theme}
            onChange={(v) => {
              const mode = v ?? 'dark'
              setTheme(mode)
              setThemeMode(mode, family)
            }}
          />
          <p className="mt-1.5 text-[14px] text-ink-2">Dark is easy to read and gentle around the baby. Warm night is dimmer still, with amber text. Each phone keeps its own choice.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ClockTimeField label="Night starts" value={family.night_start.slice(0, 5)} onChange={(v) => void saveFamilySettings({ night_start: v })} />
          <ClockTimeField label="Night ends" value={family.night_end.slice(0, 5)} onChange={(v) => void saveFamilySettings({ night_end: v })} />
        </div>
        <p className="-mt-3 text-[14px] text-ink-2">Sleep that starts in this window counts as night sleep.</p>
      </Section>

      )}

      {page === 'data' && (
        <>
      <Section title="Add records · voice or text">
        <AddRecords compact />
      </Section>

      <Section title="Past logs">
        <p className="mb-3 text-[15px] text-ink-2">Bring in what you wrote before LAPdiary, from a PDF, Word file, Google Doc, spreadsheet or WhatsApp chat. You check everything before it’s saved, and any import can be undone.</p>
        <Button variant="secondary" size="md" className="w-full" onClick={() => useLeela.getState().set({ overlay: { kind: 'import' } })}>
          <FileArrowUp size={18} weight="bold" aria-hidden="true" /> Bring in past logs
        </Button>
      </Section>

      <Section title="Words LAPdiary has learned">
        {Object.keys(prefs.vocab ?? {}).length === 0 ? (
          <p className="text-[15px] text-ink-2">When LAPdiary meets shorthand it doesn’t know, it asks you once and remembers. Your words show up here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {Object.entries(prefs.vocab ?? {})
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([term, meaning]) => (
                <li key={term} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 text-[16px]">
                    <span className="font-semibold">“{term}”</span> <span className="text-ink-2">means {meaningById(meaning)?.label.toLowerCase() ?? meaning}</span>
                  </span>
                  <button type="button" onClick={() => void forgetWord(term)} className="grid h-10 w-10 place-items-center rounded-full bg-card-2" aria-label={`Forget ${term}`}>
                    <X size={16} weight="bold" />
                  </button>
                </li>
              ))}
          </ul>
        )}
        {(prefs.feedDefault || prefs.dateOrder) && (
          <p className="mt-3 text-[14px] text-ink-3">
            {prefs.feedDefault ? `A plain “fed” means ${prefs.feedDefault === 'bottle' ? 'a bottle' : 'breastfeeding'}. ` : ''}
            {prefs.dateOrder ? `Dates are read as ${prefs.dateOrder === 'dmy' ? 'day/month' : 'month/day'}.` : ''}{' '}
            <button type="button" className="font-semibold underline underline-offset-4" onClick={() => void savePrefs({ feedDefault: undefined, dateOrder: undefined })}>
              Reset
            </button>
          </p>
        )}
      </Section>

      <Section id="set-data" title="Your data">
        <p className="mb-3 text-[15px] text-ink-2">
          Everything you log is saved on LAPdiary’s server and kept for as long as your family uses LAPdiary. Nothing expires. Deleted entries are hidden, not erased, and every change is recorded in the activity log.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="md" onClick={() => setActivity(true)}>
            <ClockCounterClockwise size={18} weight="bold" aria-hidden="true" /> See all activity
          </Button>
          <Button variant="secondary" size="md" disabled={exporting} onClick={() => void download('csv')}>
            <DownloadSimple size={18} weight="bold" aria-hidden="true" /> {exporting ? 'Preparing…' : 'Download entries (Excel, CSV)'}
          </Button>
          <Button variant="secondary" size="md" disabled={exporting} onClick={() => void download('json')}>
            <DownloadSimple size={18} weight="bold" aria-hidden="true" /> Download everything (full backup)
          </Button>
        </div>
      </Section>

        </>
      )}

      {page === 'account' && (
      <Section id="set-account" title="Your account">
        <p className="mb-3 text-[15px] text-ink-2">Signed in as {email}</p>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              void disableReminders('signed out').finally(() => {
                teardown()
                void supabase.auth.signOut().then(() => bootstrap())
              })
            }}
          >
            Sign out
          </Button>
          <Button variant="danger" size="md" onClick={() => setLeaving(true)}>
            Leave family
          </Button>
        </div>
      </Section>

      )}

      <Sheet open={nameSheet} onClose={() => setNameSheet(false)} title="Your name" footer={
        <Button className="w-full" disabled={!nameDraft.trim()} onClick={() => { void saveDisplayName(nameDraft.trim()); setNameSheet(false) }}>Save</Button>
      }>
        <TextInput label="What your family sees" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={40} />
      </Sheet>

      <Sheet open={leaving} onClose={() => setLeaving(false)} title="Leave family?">
        {lastOne ? (
          <>
            <p className="mb-4 text-[16px] text-ink-2">You’re the only member. Leaving deletes this family and everything logged in it. This can’t be undone.</p>
            <TextInput label="Type DELETE to confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" />
          </>
        ) : (
          <p className="mb-5 text-[16px] text-ink-2">
            You’ll stop seeing this family’s babies. Everything stays for the others.
            {iAmOwner ? ' Ownership passes to the longest-standing member.' : ''}
          </p>
        )}
        <Button variant="danger" className="mb-2 w-full" disabled={busy || (lastOne && confirmText.trim().toUpperCase() !== 'DELETE')} onClick={() => void leave()}>
          {lastOne ? 'Delete family and leave' : 'Leave family'}
        </Button>
      </Sheet>

      {childSheet && <ChildSheet open onClose={() => setChildSheet(null)} child={childSheet.child} />}
      <ActivitySheet open={activity} onClose={() => setActivity(false)} />
    </div>
  )
}

type Page = 'family' | 'babies' | 'alerts' | 'display' | 'data' | 'account'
const PAGE_TITLES: Record<Page, string> = { family: 'Family', babies: 'Babies', alerts: 'Notifications', display: 'Look and units', data: 'Past logs and data', account: 'Your account' }

function Rows({ title, rows }: { title: string; rows: { icon: React.ReactNode; label: string; sub: string; onClick: () => void }[] }) {
  return (
    <section className="mb-5" aria-label={title}>
      <h2 className="mb-2 px-1 text-[14px] font-semibold tracking-wide text-ink-3 uppercase">{title}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-[22px] bg-card">
        {rows.map((r) => (
          <li key={r.label}>
            <button type="button" onClick={r.onClick} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-card-2">
              <span className="shrink-0 text-brand">{r.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold">{r.label}</span>
                {r.sub && <span className="block truncate text-[13.5px] text-ink-2">{r.sub}</span>}
              </span>
              <CaretRight size={18} weight="bold" className="shrink-0 text-ink-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-6 scroll-mt-4 rounded-[28px] bg-card p-5" aria-label={title}>
      <h2 className="mb-2 font-display text-[20px] font-bold">{title}</h2>
      {children}
    </section>
  )
}
