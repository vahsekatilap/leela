# LAPdiary (was Leela) – notes for Claude

LAPdiary is the baby tracker Keshav and Nida use for their daughter Leela (Leela Ansari Palita; the app was called Leela until 21 Nov 2026 and the code, repo, database and web address still use that name, so keep them). In anything the family sees, the app is "LAPdiary" and "Leela" means the baby. It was built by their friend Shiven and handed over to Keshav on 21 Nov 2026; Keshav now owns it and develops it with Claude.

- Code: this repo (`vahsekatilap/leela`, public). React + Vite PWA, deployed to GitHub Pages by `.github/workflows/deploy.yml` at https://vahsekatilap.github.io/leela/.
- Database: Supabase project `rtebcagicaypvgfeqsjn` ("Leela", West EU), in Keshav's "Palita Family" organisation. The app uses only the publishable key (`.env.production`). Secret API key `default` was replaced on 21 Nov; legacy keys are disabled and the old HS256 signing key is revoked; the database password was reset and nobody keeps it.
- Keshav only wants to press buttons: ask tap-to-answer questions, never ask him to run commands. Never use the word "secret" in anything the family sees; say "private".

## Ghar bridge (keep it working)

Ghar, the family's Android app (repo `vahsekatilap/ghar`, Supabase project `sfjzdkajewcrcqzbpyou`), shows Leela's live status and lets family and the nanny log sleep, feeds, nappies and notes. It does this only through the edge function `supabase/functions/ghar-bridge` (deployed with verify_jwt off) and the table `ghar_links` (Ghar household → Leela family + child; migration 0004).

- Any change to Leela's tables, event types, `data` fields or the sweet spot must keep the bridge's requests and replies the same (`status`, `log`, `delete` – see the comment at the top of `ghar-bridge/index.ts`). Change the bridge's insides if needed, never its shape, unless Ghar is changed in the same piece of work.
- The bridge reuses the sweet spot code: `npm run build:edge` writes `sweetspot.js` into both `sweetspot-push/` and `ghar-bridge/` (and `alerts.js` into `sweetspot-push/`). Redeploy both functions after changing `src/lib/sweetspot.ts`.
- Entries logged from Ghar have no `created_by` (Ghar people aren't Leela users); `data.ghar` holds who logged it (`by`, `member`), the room (`room`) and any extra words (`detail`). The app shows `data.ghar.by` wherever it shows who logged an entry (`loggedBy()` / `gharName()` in `src/lib/store.ts`); use those for any new place.
- Bottles of breast milk from Ghar are saved with `contents: 'breast'` (they were `'breastmilk'` until 21 Nov 2026; migration 0005 fixed the old rows).
- Who may see or log is decided in Ghar (`leela_access()` there), asked with the person's own Ghar sign-in.
- Added 21 Nov 2026 (only added, nothing changed): status gives `wake_range`, `pump` and `vitamins` (the bridge now also bundles `alerts.js`); `log` takes `activity` and `vitamin`. Ghar build 3c88c19 shows and uses them.

## Notifications

One edge function, `sweetspot-push`, sends every notification, every minute from pg_cron: the sweet spot, medicine doses (medicines logged with "Remind about the next dose" keep `data.every_h`; the latest entry of that medicine decides), vaccines (2 days before and on the day, from 9 am) and the evening summary (at each person's time). Each person's choices are in `profiles.prefs.alerts` (`readAlerts()` in `src/lib/alerts.ts`; all on by default, summary 8:30 pm) and apply to every phone where they turned notifications on (`push_subscriptions`). `push_sent` makes each one go out once per phone. Medicine, vaccine and summary code lives in `src/lib/alerts.ts` and `src/lib/vaccines.ts` with no libraries, bundled into `sweetspot-push/alerts.js` by `npm run build:edge`; redeploy `sweetspot-push` after changing them.

## Sweet spot (rebuilt 21 Nov 2026)

`src/lib/sweetspot.ts` (no libraries) learns each baby's own rhythm; there are no fixed targets. Awake time before the next sleep comes from weighted quantiles of past awake gaps near the same time of day (recent days count most, half-life 7 days, half pulled to the clock time), nap and night lengths likewise, and the baby's own night (onset, wake, length) from recent long sleeps (half-life 2 days), so a moved bedtime is followed within a few nights. Nights last until the usual wake time; awake in the night gives a `resettle` bedtime (no notification). Feeds know the baby doesn't feed in long sleeps (`feed.when`: gap, on-waking, before-sleep). `accuracy` re-predicts the last two weeks for the Sweet spot screen. Keshav chose not to set a bedtime goal (Nov 2026); revisit with him in a few weeks only if needed. Tune with backtests on real logs kept outside the repo (it's public), never commit them.

## Massage and vitamins

Massage is an activity kind (`massage`; older imported ones have `data.label` 'Massage') with its own home button. Daily vitamins: the list is `children.settings.supplements` (`src/lib/supplements.ts`), the Vitamins home button opens `src/components/Vitamins.tsx`, and each one given is a Medicine entry with `data.supplement: true`. Home buttons are a 3×3 grid: Sleep, Feed, Diaper, Bottle, Pump, Activity, Vitamins, Solids, More (since 21 Nov 2026: one Activity button with every kind, ticks for today's and a word on usual ones not done yet; Pump opens the pumping coach; Solids opens the Solids screen).

## Outings and pumping (Nida's ideas, 21 Nov 2026)

Outings and visits are the activity kind `outing` with `data.where` (place chips from the family's own past places); History shows them with their places. Firsts (first visit somewhere) stay milestones. Time to pump: `pumpDue()` in `src/lib/alerts.ts` works breast by breast (Nida nurses one side and often pumps the other): each side's last emptying (breastfeed or pumping, sides from `left_s/right_s` or `left_ml/right_ml`, both when not noted) plus her own usual gap for that side at that time of day over the last week. Shown on the Pump home button and in the pumping sheet; the "Time to pump" notification is off by default (`prefs.alerts.pump`), sent by `sweetspot-push` once per emptying, with the side's usual yield at that time (`expectedMl`). The pumping coach (`src/lib/pumping.ts`, `src/screens/PumpingScreen.tsx`, overlay `pumping`, opened from the pumping sheet and History › Pumping) shows ml a day and the trend against the week before, yield by time of day and side, emptyings a day, the longest stretch, suggestions from common breastfeeding guidance, and how well "time to pump" did.

## Pumping coach, milk stash and nudges (21 Nov 2026)

- The Pump button opens the coach (`src/screens/PumpingScreen.tsx`, overlay `pumping`, also `?open=pumping`): Start pumping (suggested start side and length; while running, a timer with prompts from `sittingPrompt()`, the newest photo of the baby, and Stop opens the entry for the ml and where the milk went), best time to pump per side with a line about Leela's sleep or feed, today against her own usual day with a streak (`pumpTarget()`), the next 24 hours (`pumpPlan()` in alerts.ts, interleaved with Leela's predicted sleeps), the milk stash, then the older insights.
- Milk stash (`src/lib/stash.ts`): pumpings with `data.stash` fridge/freezer go in; breast-milk bottles take out oldest first from `data.stash` (fridge/freezer), none when 'fresh', fridge then freezer when unsaid (Ghar bottles); `stash_gone_at` marks used or thrown away. Fridge 4 days, freezer 6 months (CDC).
- Nudges (`src/lib/nudges.ts`, timing from `src/lib/routine.ts`): strict underneath (her own rhythm checked against WHO/IAP/CDC guidance), gentle words (what helps next, never what was missed; `dayContext()` explains a longer gap after an outing, vaccines or her being unwell). "Important" only for a real miss: long stretch without a feed beyond what's usual for her age, no wet nappy for 6 h (only when nappies are logged closely), a vitamin missed two days running, a breast unemptied 8 h, fridge milk past 4 days. Sent by `sweetspot-push` to both parents (prefs `routine`, `important`, `pump`, `stash`), gentle ones at most 3 a day, never while she sleeps; Today shows the same (`src/components/Nudges.tsx`). Keshav's wishes: gentle, encouraging, classy and subtle; Nida should never feel bad.

## Reminders, diary and solids (21 Nov 2026)

`sweetspot-push` also sends a vitamins nudge from 7 pm when one on the list isn't given (`vitaminsLeft`, pref `vitamins`) and "How the week went" on Sunday from 11 am (`weekText`, pref `weekly`, against the week before). The Diary tab is month by month of her life (figures and memories, latest two open), "on this day" from earlier months, and a photo grid. Solids (Solids home button, overlay `solids`; `src/lib/solids.ts`; doctor's plan: start the first week of Jan 2027): logger on top with food chips and water (a `solids` entry with `data.drink: 'water'`, not counted as a feed or meal), suggestions (try next from the family's list with the 3-day wait, iron-rich, allergens, keep offering, stage by age from WHO), the family's own foods list (`children.settings.solids.list`), recipes (built-in ideas, their own in `children.settings.solids.recipes`, AI ideas from Ghar's `lap-ideas` function with the LAPdiary sign-in, YouTube links), readiness signs (`settings.solids.ready`), countdown, foods tried, allergens, safety.

## History (rebuilt 21 Nov 2026)

One period bar (`src/components/history/PeriodBar.tsx`, periods in `src/lib/period.ts`): Day, Week (last 7 days, the default), Month (calendar), All (since birth), plus a sheet for any day, month of life, calendar month or own dates. Day shows the day strip, tappable totals and the timeline. Longer periods show an overview of category rows (`src/lib/insights.ts`: sleep, feeds, diapers, pumping, each activity kind, vitamins, medicine, temperature, symptoms, growth, firsts, notes) with sparklines and change against the period before; every row opens `src/screens/HistoryDetail.tsx` (figures, bars by day/week/month, time of day, every entry). Activities are counted in times; minutes only from entries with a length (most imported ones have none) and the screen says so. Medicines named like vitamins count as vitamins (`isSupplement`). Search (`HistorySearch.tsx`) covers all history; the ⋯ button has the doctor report for the chosen dates (overlay `report` with `from`/`to`; long ranges become weekly rows), the memory book and import. Older entries load on demand (`loadAllHistory`).

## Development guide, speed and offline (21 Nov 2026)

Development (overlay `development`, `src/lib/development.ts`): the CDC's 2022 milestone checklists from 2 months to 2 years; ticking a skill saves a First with `data.dev` = the skill id. Shown in Diary, More › Play and memories and Settings › Care. Screens other than Today load on demand (`lazy` in `App.tsx`, prefetched 3 s after opening). Changes the server refuses go to `db.failed` (Dexie v2) instead of being dropped and are retried on every open (`retryFailed()`); 5xx and timeouts are retried like being offline. Sheets and screens lock page scrolling through a counter (`src/lib/scrollLock.ts`).

## Vaccines

Leela's three earlier Vaccine entries (1 Sep, 30 Sep, 30 Oct 2026) were linked to the 6, 10 and 14-week doses on 21 Nov 2026, and the birth doses marked as given before.

`src/lib/vaccines.ts` has India's IAP-ACVIP 2023 schedule. A dose counts as given when a Vaccine entry (type `symptom`, `data.kind` `vaccine`) lists its id in `data.vax`. The family's own dates, doses they're not having and doses given before they used the list live in `children.settings.vaccines` (`dates`, `skip`, `before`). The screen is `src/screens/VaccinesScreen.tsx` (overlay `vaccines`, also opened by `?open=vaccines` or a tapped vaccine notification).

## Backups

The `backup` edge function (verify_jwt off, checks the cron secret) saves a gzipped JSON copy of every table and the sign-in list to the private storage bucket `backups` (`daily/leela-YYYY-MM-DD.json.gz`) every night at 03:17 India time (pg_cron job `leela-backup`), keeping 30 days. To restore, download a copy and upsert the rows (parents before children: families, profiles, family_members, children, imports, events, timer_segments). If Leela ever has other families, switch to Supabase's paid plan for proper backups. `backup.yml` (weekly copy to GitHub) stays off: Keshav chose not to keep database passwords in a public repo.

## Deploying edge functions

The deployed functions are one-line wrappers made in the Supabase dashboard (Edge Functions > function > Code > Deploy updates): `import 'https://cdn.jsdelivr.net/gh/vahsekatilap/leela@<commit>/supabase/functions/<name>/index.ts'`. The real code and its helper files load from that exact commit, so push first, then change the commit in the wrapper. `ghar-bridge`, `sweetspot-push`, `backup` and `admin` are deployed this way; all have Verify JWT off. The Supabase connector's deploy_edge_function can also deploy the one-line wrapper directly. `leela-check` is Shiven's old one-off test function.

## Checking work

Network installs may not work in Claude's workspace. Push work to a branch first: `.github/workflows/check.yml` runs lint, unit tests, the edge bundles and the build, and writes `<branch>/report.md` (plus freshly built `bundles/`) to the `check-results` branch, readable with git. Merge to main only when it passes; main deploys the app.

## Look and behaviour (Keshav's choices, Nov 2026)

- Dark theme by default, always (`[data-theme="dark"]` in `src/index.css`); Settings offers Warm night and Light per phone. `index.html` and the manifest are dark from the first frame so there is never a white flash.
- Logo: the LAP wordmark (ivory letters, the A's crossbar an amber curve like a lap) on charcoal: `public/favicon.svg`, the PNG icons and `src/components/LeelaMark.tsx`.
- Pumping is shared with the whole family (`sharedWithFamily` in `src/lib/config.ts`, `showsFor()`); contractions stay private.
- Home buttons: Sleep, Feed, Diaper, Bottle, Pump, Activity, Vitamins, Solids, More (a 3×3 grid). Bottle and pumping start now and stop later; stopping opens the entry to fill in the amount.
- Times are picked on scroll wheels (`WheelTimeSheet` in `src/components/TimeField.tsx`), never the clock dial.
- The timeline shows "35 min · 8:45 – 9:20 AM" under each entry that lasts a while (`timeSpanText()` in `src/lib/describe.ts`).
- The Family tab is now Settings: a short list (Family, Babies, Care tools, Notifications, Look and units, Records, Account, Admin for Keshav) where each row opens its page (`page` state in `FamilyScreen.tsx`, Android back returns to the list). The admin panel (`src/screens/AdminScreen.tsx`, edge function `admin`) shows only to people whose `profiles.prefs.admin` is true: Keshav. Nobody else should see that it exists. WHO growth curves and percentiles appear only there; History shows plain growth.
- Sync: opening the app with a copy on the phone fetches only what changed (`refresh()`), renewing the sign-in first; coming back to the app (`resume()`) catches up at once and reconnects live updates; a 15-second safety check runs while live updates are down. While catching up after a long gap, Today says so and dims timers.

## Known follow-ups

- Done on 21 Nov 2026: `sweetspot-push` uses the new address (and maps old saved links to it); Shiven's empty test account ("Goel"), the check family and all end-to-end test families and accounts were deleted (only the family "NIKE" with Keshav, Nida and Leela is left; 26 old test photos remain in the `family` bucket under deleted family folders); `e2e.yml` runs only by hand now (a full run adds test families to the real database, so delete them afterwards). It still has no `CANARY_KEY`.
