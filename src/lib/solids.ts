// Starting solids: every food tried so far, the common allergens, the wait after a new food and
// readiness before six months. Food names are free text, so allergens are recognised by word.
import type { LeelaEvent } from './types'

export const ALLERGENS: { id: string; label: string; words: RegExp }[] = [
  { id: 'egg', label: 'Egg', words: /\b(egg|eggs|anda|omelette)\b/i },
  { id: 'dairy', label: 'Milk products', words: /\b(milk|curd|dahi|yogh?urt|paneer|cheese|kheer|lassi)\b/i },
  { id: 'wheat', label: 'Wheat', words: /\b(wheat|atta|roti|chapati|phulka|suji|sooji|semolina|daliya|dalia|bread|upma)\b/i },
  { id: 'peanut', label: 'Peanut', words: /\b(peanuts?|groundnuts?|moong ?phali|mungfali)\b/i },
  { id: 'nuts', label: 'Tree nuts', words: /\b(almonds?|badam|cashews?|kaju|walnuts?|akhrot|pistachios?|pista)\b/i },
  { id: 'soy', label: 'Soy', words: /\b(soya?|tofu)\b/i },
  { id: 'sesame', label: 'Sesame', words: /\b(sesame|til)\b/i },
  { id: 'fish', label: 'Fish', words: /\b(fish|machli|machhli|salmon|rohu)\b/i },
  { id: 'shellfish', label: 'Shellfish', words: /\b(prawns?|shrimps?|crabs?|jhinga)\b/i },
]

export const READY_SIGNS: { id: string; label: string }[] = [
  { id: 'sits', label: 'Sits up with a little support and holds her head steady' },
  { id: 'interest', label: 'Watches you eat and reaches for food' },
  { id: 'mouth', label: 'Opens her mouth when a spoon comes near' },
  { id: 'swallow', label: 'Keeps food in and swallows instead of pushing it out' },
]

/** Common first foods in Indian homes, for ideas (not advice: the doctor knows her best). */
export const FIRST_FOODS = ['Mashed banana', 'Rice khichdi', 'Moong dal khichdi', 'Ragi porridge', 'Mashed sweet potato', 'Apple puree', 'Mashed carrot', 'Pear puree', 'Mashed avocado', 'Suji kheer']

export interface Food {
  name: string
  times: number
  first: number
  last: number
  liked: number
  disliked: number
  allergens: string[]
  /** Any reaction or note logged with it. */
  notes: string[]
}

const reactionOf = (e: LeelaEvent) => e.data.reaction

export function foodsTried(events: LeelaEvent[], childId: string): Food[] {
  const by = new Map<string, Food>()
  for (const e of events) {
    if (e.deleted_at || e.type !== 'solids' || e.child_id !== childId) continue
    const at = Date.parse(e.started_at)
    for (const f of e.data.foods ?? []) {
      const k = f.name.trim().toLowerCase()
      if (!k) continue
      const cur = by.get(k) ?? { name: f.name.trim(), times: 0, first: at, last: at, liked: 0, disliked: 0, allergens: [], notes: [] }
      cur.times++
      cur.first = Math.min(cur.first, at)
      cur.last = Math.max(cur.last, at)
      if (reactionOf(e) === 'liked') cur.liked++
      if (reactionOf(e) === 'disliked') cur.disliked++
      for (const a of ALLERGENS) if (a.words.test(f.name) && !cur.allergens.includes(a.id)) cur.allergens.push(a.id)
      if (f.allergen && !cur.allergens.length) cur.allergens.push('other')
      if (e.notes) cur.notes.push(e.notes)
      by.set(k, cur)
    }
  }
  return [...by.values()].sort((a, b) => b.last - a.last)
}

/** Foods first tried in the last three days: the usual wait before the next new one. */
export function watching(foods: Food[], now: number): Food[] {
  return foods.filter((f) => now - f.first < 3 * 86_400_000)
}

// ------------------------------------------------------------------------- her own list
export type Group = 'grain' | 'dal' | 'veg' | 'fruit' | 'dairy' | 'protein' | 'other'
export const GROUPS: { id: Group; label: string }[] = [
  { id: 'grain', label: 'Grains' },
  { id: 'dal', label: 'Dals' },
  { id: 'veg', label: 'Vegetables' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'protein', label: 'Egg, fish, meat' },
  { id: 'other', label: 'Other' },
]
export interface ListFood {
  name: string
  group: Group
}

/** Where many Indian families start, roughly in this order. The family edits it. */
export const STARTER_LIST: ListFood[] = [
  { name: 'Rice', group: 'grain' },
  { name: 'Moong dal', group: 'dal' },
  { name: 'Banana', group: 'fruit' },
  { name: 'Sweet potato', group: 'veg' },
  { name: 'Ragi', group: 'grain' },
  { name: 'Apple', group: 'fruit' },
  { name: 'Carrot', group: 'veg' },
  { name: 'Pumpkin', group: 'veg' },
  { name: 'Pear', group: 'fruit' },
  { name: 'Masoor dal', group: 'dal' },
  { name: 'Curd', group: 'dairy' },
  { name: 'Suji', group: 'grain' },
  { name: 'Egg', group: 'protein' },
  { name: 'Bottle gourd (lauki)', group: 'veg' },
  { name: 'Papaya', group: 'fruit' },
  { name: 'Oats', group: 'grain' },
  { name: 'Spinach', group: 'veg' },
  { name: 'Paneer', group: 'dairy' },
  { name: 'Peanut (smooth paste, thinned)', group: 'protein' },
  { name: 'Fish', group: 'protein' },
]

export function readList(settings: Record<string, unknown> | null | undefined): ListFood[] {
  const raw = (settings?.solids as { list?: unknown } | undefined)?.list
  if (!Array.isArray(raw)) return STARTER_LIST
  return raw.filter((x): x is ListFood => Boolean(x) && typeof (x as ListFood).name === 'string' && (x as ListFood).name.trim() !== '').map((x) => ({ name: x.name.trim(), group: GROUPS.some((g) => g.id === x.group) ? x.group : 'other' }))
}

/** A food on the list counts as tried when a logged food's name contains it (or the other way round). */
export function matchesFood(listName: string, logged: string): boolean {
  const a = listName.toLowerCase().replace(/\(.*?\)/g, '').trim()
  const b = logged.toLowerCase()
  return Boolean(a) && (b.includes(a) || a.includes(b))
}

export const IRON_RICH = /\b(ragi|nachni|dal|lentils?|moong|masoor|toor|arhar|rajma|chana|chickpeas?|eggs?|chicken|mutton|meat|fish|spinach|palak|beetroot|dates|khajur|jaggery|gur|bajra|jowar|amaranth|rajgira|tofu|poha|fortified)\b/i

// ------------------------------------------------------------------------- by age
export interface Stage {
  label: string
  texture: string
  meals: [number, number]
  amount: string
  tip: string
}

/** WHO complementary feeding guidance (2023) by age in months; breast milk stays the main food at first. */
export function stageFor(months: number): Stage {
  if (months < 7)
    return { label: '6 months', texture: 'Smooth purées and soft mashes, thick enough to stay on a spoon', meals: [2, 3], amount: '2–3 teaspoons at first, building up slowly', tip: 'Offer after a milk feed, when she’s calm and alert. Thin with breast milk rather than water at first.' }
  if (months < 9)
    return { label: '7–8 months', texture: 'Mashed and lumpier, plus soft finger foods she can squash with her gums', meals: [2, 3], amount: 'Up to half a small bowl (125 ml)', tip: 'Let her hold soft pieces and feed herself; mess is how she learns.' }
  if (months < 12)
    return { label: '9–11 months', texture: 'Finely chopped and soft pieces, finger foods', meals: [3, 4], amount: 'About half a bowl (125 ml) a meal, plus 1–2 snacks', tip: 'Most family foods work, cooked soft, cut small and without added salt or sugar.' }
  return { label: '12 months and up', texture: 'Family food, cut small and soft', meals: [3, 4], amount: 'Three-quarters to a full bowl (250 ml), plus 1–2 snacks', tip: 'She eats with the family now: same food, no extra salt or sugar, whole pieces only when soft.' }
}

export const SAFETY = [
  'No salt, sugar or honey before her first birthday.',
  'Nothing she could choke on: no whole nuts, whole grapes, raw hard vegetables or popcorn. Nuts only as smooth pastes.',
  'Always seated upright and watched while she eats.',
  'Water: a few sips from an open or sippy cup with meals, from 6 months. No juice.',
]

export function nextFood(list: ListFood[], foods: Food[], now: number): { name: string | null; waitUntil: number | null } {
  const recent = watching(foods, now)
  const waitUntil = recent.length ? Math.max(...recent.map((f) => f.first)) + 3 * 86_400_000 : null
  const next = list.find((l) => !foods.some((f) => matchesFood(l.name, f.name)))
  return { name: next?.name ?? null, waitUntil }
}

// ------------------------------------------------------------------------- recipes
export interface Recipe {
  id: string
  title: string
  /** From which age, in months. */
  from?: number
  ingredients: string[]
  steps: string[]
  link?: string
  /** Built-in idea, saved by the family, or suggested by the AI. */
  source: 'idea' | 'own' | 'ai'
  note?: string
}

export const RECIPE_IDEAS: Recipe[] = [
  { id: 'i-khichdi', title: 'Moong dal khichdi', from: 6, ingredients: ['2 tbsp rice', '1 tbsp yellow moong dal', 'A pinch of turmeric', '1 tsp ghee'], steps: ['Wash and soak rice and dal for 20 minutes.', 'Pressure cook with 1 cup water for 4–5 whistles until very soft.', 'Mash or blend smooth, thin with a little warm water or breast milk.', 'Stir in the ghee. No salt.'], source: 'idea' },
  { id: 'i-ragi', title: 'Ragi porridge', from: 6, ingredients: ['1 tbsp ragi flour', '½ cup water'], steps: ['Mix the flour into cold water with no lumps.', 'Cook on low, stirring, for 5–7 minutes until thick and glossy.', 'Cool and thin with breast milk if needed.'], source: 'idea' },
  { id: 'i-banana', title: 'Mashed banana', from: 6, ingredients: ['½ ripe banana'], steps: ['Mash well with a fork.', 'Thin with a little breast milk for the first tries.'], source: 'idea' },
  { id: 'i-sweetpotato', title: 'Sweet potato mash', from: 6, ingredients: ['1 small sweet potato'], steps: ['Peel, cube and steam for 10–12 minutes until soft.', 'Mash smooth; thin as needed.'], source: 'idea' },
  { id: 'i-apple', title: 'Steamed apple purée', from: 6, ingredients: ['1 apple'], steps: ['Peel, core and chop.', 'Steam 8–10 minutes until soft.', 'Blend smooth.'], source: 'idea' },
  { id: 'i-carrot', title: 'Carrot and pumpkin purée', from: 6, ingredients: ['1 small carrot', 'A slice of pumpkin'], steps: ['Peel, chop and steam until soft.', 'Blend smooth with a little of the steaming water.'], source: 'idea' },
  { id: 'i-dal', title: 'Masoor dal mash', from: 6, ingredients: ['2 tbsp red masoor dal', 'A pinch of turmeric', '½ tsp ghee'], steps: ['Wash and cook with 1 cup water until completely soft.', 'Mash thick (not watery: thick dal has the iron and energy).', 'Add the ghee.'], source: 'idea' },
  { id: 'i-suji', title: 'Suji porridge', from: 6, ingredients: ['1 tbsp suji', '1 tsp ghee', '½ cup water'], steps: ['Roast the suji in ghee on low until it smells nutty.', 'Add water slowly, stirring, and cook until soft.', 'Cool; thin with breast milk. Suji is wheat: watch the first time.'], source: 'idea' },
  { id: 'i-egg', title: 'Mashed egg', from: 6, ingredients: ['1 egg'], steps: ['Hard boil for 10–12 minutes (no runny yolk).', 'Mash finely with a little breast milk or ghee.', 'A common allergen: start with a little, in the morning.'], source: 'idea' },
  { id: 'i-vegkhichdi', title: 'Vegetable khichdi', from: 7, ingredients: ['2 tbsp rice', '1 tbsp moong dal', 'Carrot, lauki and peas, chopped', '1 tsp ghee', 'Pinch of jeera'], steps: ['Temper jeera in ghee, add vegetables, rice and dal.', 'Pressure cook with 1½ cups water until soft.', 'Mash to the texture she manages.'], source: 'idea' },
  { id: 'i-curd', title: 'Curd with fruit', from: 7, ingredients: ['2 tbsp plain fresh curd', 'Mashed banana or pear'], steps: ['Stir the fruit into the curd.', 'Serve at room temperature.'], source: 'idea' },
  { id: 'i-fingers', title: 'Soft finger foods', from: 8, ingredients: ['Steamed carrot sticks', 'Ripe banana strips', 'Soft paneer fingers'], steps: ['Cut into finger-length strips she can hold.', 'Steam until they squash easily between your fingers.'], source: 'idea' },
]

export const youtubeLink = (title: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} baby food recipe`)}`

export function readRecipes(settings: Record<string, unknown> | null | undefined): Recipe[] {
  const raw = (settings?.solids as { recipes?: unknown } | undefined)?.recipes
  return Array.isArray(raw) ? raw.filter((r): r is Recipe => Boolean(r) && typeof (r as Recipe).title === 'string' && Array.isArray((r as Recipe).steps)) : []
}
