// What most babies do by each age, in four areas, from the CDC's "Learn the Signs. Act Early."
// checklists (2022), which list what about 3 in 4 children do by that age. Ticking one off saves
// it as a First (milestone entry with data.dev set to the skill's id).
import type { LeelaEvent } from './types'

export type Area = 'move' | 'hands' | 'talk' | 'social'
export const AREAS: Record<Area, string> = { move: 'Moving', hands: 'Hands and thinking', talk: 'Sounds and words', social: 'Feelings and people' }

export interface Skill {
  id: string
  label: string
  /** Most babies do it by this age, in months. */
  by: number
  area: Area
}

const s = (by: number, area: Area, id: string, label: string): Skill => ({ id, label, by, area })

export const SKILLS: Skill[] = [
  s(2, 'social', 'calms', 'Calms down when spoken to or picked up'),
  s(2, 'social', 'faces', 'Looks at your face'),
  s(2, 'social', 'smile', 'Smiles when you talk or smile at her'),
  s(2, 'talk', 'sounds', 'Makes sounds other than crying'),
  s(2, 'talk', 'loud', 'Reacts to loud sounds'),
  s(2, 'hands', 'watches', 'Watches you as you move'),
  s(2, 'move', 'head-tummy', 'Holds her head up when on her tummy'),
  s(2, 'move', 'arms-legs', 'Moves both arms and both legs'),
  s(4, 'social', 'smile-own', 'Smiles on her own to get your attention'),
  s(4, 'social', 'chuckle', 'Chuckles when you try to make her laugh'),
  s(4, 'talk', 'coo', 'Makes cooing sounds like “oooo” and “aahh”'),
  s(4, 'talk', 'talk-back', 'Makes sounds back when you talk to her'),
  s(4, 'talk', 'turn-voice', 'Turns her head towards your voice'),
  s(4, 'hands', 'hands-look', 'Looks at her hands with interest'),
  s(4, 'hands', 'hold-toy', 'Holds a toy when you put it in her hand'),
  s(4, 'hands', 'swing', 'Swings an arm at toys'),
  s(4, 'hands', 'hands-mouth', 'Brings her hands to her mouth'),
  s(4, 'move', 'head-steady', 'Holds her head steady without support when held'),
  s(4, 'move', 'elbows', 'Pushes up onto her elbows or forearms on her tummy'),
  s(6, 'social', 'knows-people', 'Knows familiar people'),
  s(6, 'social', 'mirror', 'Likes looking at herself in a mirror'),
  s(6, 'social', 'laughs', 'Laughs'),
  s(6, 'talk', 'turns', 'Takes turns making sounds with you'),
  s(6, 'talk', 'raspberries', 'Blows “raspberries” (sticks her tongue out and blows)'),
  s(6, 'talk', 'squeals', 'Makes squealing noises'),
  s(6, 'hands', 'mouths', 'Puts things in her mouth to explore them'),
  s(6, 'hands', 'reaches', 'Reaches to grab a toy she wants'),
  s(6, 'move', 'rolls', 'Rolls from tummy to back'),
  s(6, 'move', 'straight-arms', 'Pushes up with straight arms on her tummy'),
  s(6, 'move', 'leans', 'Leans on her hands to hold herself up when sitting'),
  s(9, 'social', 'strangers', 'Is shy or clingy with strangers'),
  s(9, 'social', 'faces-many', 'Shows several expressions: happy, sad, angry, surprised'),
  s(9, 'social', 'name', 'Looks when you call her name'),
  s(9, 'social', 'peekaboo', 'Smiles or laughs at peek-a-boo'),
  s(9, 'talk', 'babble', 'Babbles “mamamama” or “babababa”'),
  s(9, 'talk', 'arms-up', 'Lifts her arms up to be picked up'),
  s(9, 'hands', 'looks-for', 'Looks for things she sees you drop'),
  s(9, 'hands', 'bangs', 'Bangs two things together'),
  s(9, 'hands', 'hand-to-hand', 'Moves things from one hand to the other'),
  s(9, 'move', 'sits', 'Sits without support'),
  s(9, 'move', 'gets-sitting', 'Gets herself into a sitting position'),
  s(12, 'social', 'patacake', 'Plays games with you, like pat-a-cake'),
  s(12, 'talk', 'waves', 'Waves bye-bye'),
  s(12, 'talk', 'mama-dada', 'Calls a parent “mama”, “papa” or another special name'),
  s(12, 'talk', 'no', 'Understands “no” (pauses or stops)'),
  s(12, 'hands', 'container', 'Puts something into a container'),
  s(12, 'hands', 'hidden', 'Looks for things she sees you hide'),
  s(12, 'hands', 'pincer', 'Picks things up between thumb and finger'),
  s(12, 'move', 'pulls-up', 'Pulls up to stand'),
  s(12, 'move', 'cruises', 'Walks holding on to furniture'),
  s(15, 'social', 'copies', 'Copies other children while playing'),
  s(15, 'social', 'shows', 'Shows you an object she likes'),
  s(15, 'talk', 'words', 'Tries to say one or two words besides “mama” or “papa”'),
  s(15, 'talk', 'points', 'Points to ask for something or to get help'),
  s(15, 'hands', 'stacks', 'Stacks at least two small objects'),
  s(15, 'move', 'steps', 'Takes a few steps on her own'),
  s(15, 'move', 'finger-food', 'Feeds herself with her fingers'),
  s(18, 'talk', 'three-words', 'Tries to say three or more words besides “mama” or “papa”'),
  s(18, 'talk', 'follows', 'Follows one-step directions without gestures'),
  s(18, 'hands', 'scribbles', 'Scribbles'),
  s(18, 'move', 'walks', 'Walks without holding on'),
  s(18, 'move', 'spoon', 'Tries to use a spoon'),
  s(24, 'talk', 'two-words', 'Says two words together, like “more milk”'),
  s(24, 'talk', 'body-parts', 'Points to at least two body parts when asked'),
  s(24, 'move', 'kicks', 'Kicks a ball'),
  s(24, 'move', 'runs', 'Runs'),
]

export const skillById = (id: string) => SKILLS.find((x) => x.id === id)

/** Skills ticked off, by id, with the First that records each. */
export function skillsDone(events: LeelaEvent[], childId: string): Map<string, LeelaEvent> {
  const out = new Map<string, LeelaEvent>()
  for (const e of events) {
    if (e.deleted_at || e.type !== 'milestone' || e.child_id !== childId || typeof e.data.dev !== 'string') continue
    const cur = out.get(e.data.dev)
    if (!cur || e.started_at < cur.started_at) out.set(e.data.dev, e)
  }
  return out
}

/** Months of age (fractional) on a date. */
export function ageMonthsAt(birth: string, at: number): number {
  const b = Date.parse(`${birth}T00:00:00Z`)
  return (at - b) / (30.4375 * 86_400_000)
}

export interface DevPlan {
  /** Skills most babies do by now that aren't ticked yet. */
  now: Skill[]
  /** The next age's skills. */
  next: Skill[]
  nextBy: number | null
  done: number
}

export function devPlan(done: Map<string, unknown>, months: number): DevPlan {
  const open = SKILLS.filter((x) => !done.has(x.id))
  const due = open.filter((x) => x.by <= Math.ceil(months))
  const later = open.filter((x) => x.by > Math.ceil(months))
  const nextBy = later.length ? later[0].by : null
  return { now: due, next: nextBy === null ? [] : later.filter((x) => x.by === nextBy), nextBy, done: done.size }
}
