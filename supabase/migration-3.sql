-- Update für Zug und Fokus. Im Supabase SQL Editor einmal ausführen (mehrfaches Ausführen schadet nicht).
create or replace function public.set_table(p_session uuid, p_table jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.session_members
    where session_id = p_session and user_id = auth.uid() and seat is not null
  ) then
    raise exception 'Kein Spielerplatz in dieser Session';
  end if;
  update public.sessions
     set state = jsonb_set(coalesce(state, '{"players":{}}'::jsonb), '{table}', p_table, true)
   where id = p_session;
end $$;
