-- Update für zweifarbige Karten, Signature-Karten und Kartencode.
-- Im Supabase SQL Editor einmal ausführen (mehrfaches Ausführen schadet nicht).
alter table public.cards add column if not exists color2 text;
alter table public.cards add column if not exists signature boolean not null default false;
alter table public.cards add column if not exists code text;
