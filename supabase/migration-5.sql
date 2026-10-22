-- v7: Energy, Might, Power und Power-Farben pro Karte
alter table public.cards add column if not exists energy integer;
alter table public.cards add column if not exists might integer;
alter table public.cards add column if not exists power integer;
alter table public.cards add column if not exists power_colors text;
