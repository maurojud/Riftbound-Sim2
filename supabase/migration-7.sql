-- v15: Legends können Energy- oder Power-Kosten übernehmen
alter table public.cards add column if not exists legend_energy integer;  -- so viel Energy übernimmt die Legend
alter table public.cards add column if not exists legend_power integer;   -- so viel Power übernimmt die Legend
alter table public.cards add column if not exists legend_kinds text;     -- für welche Kartenarten (z. B. Unit,Spell); leer = alle
alter table public.cards add column if not exists legend_tap boolean;      -- false = Legend wird beim Übernehmen von Kosten nicht getappt (leer/true = getappt)
