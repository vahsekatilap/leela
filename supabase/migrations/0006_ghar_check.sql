-- Entries from Ghar wait for a check in LAPdiary (22 Nov 2026). The ghar-bridge
-- function writes with the server key (no signed-in user), so anything it
-- inserts with data.ghar, or a sleep it wakes, is marked data.ghar_check; the
-- "From Ghar · to check" card clears it on Approve. (The bridge also sets it
-- itself from its next deploy; this trigger covers both.)
create or replace function private.events_ghar_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null or new.data ? 'ghar_check' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.created_by is null and new.data ? 'ghar' then
    new.data := new.data || jsonb_build_object('ghar_check',
      jsonb_build_object('by', coalesce(new.data #>> '{ghar,by}', 'Ghar'), 'what', 'logged'));
  elsif tg_op = 'UPDATE' and old.type = 'sleep' and old.timer_state is not null and new.timer_state is null then
    new.data := new.data || jsonb_build_object('ghar_check', jsonb_build_object('by', 'Ghar', 'what', 'woke'));
  end if;
  return new;
end $$;

drop trigger if exists events_ghar_check on public.events;
create trigger events_ghar_check before insert or update on public.events
  for each row execute function private.events_ghar_check();
