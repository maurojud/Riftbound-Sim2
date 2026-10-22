-- v14: Token-Typ, Battlefield-Token-Modus, "kommt bereit ins Spiel"
alter table public.cards add column if not exists token_type text;      -- Unit | Gear | Spell | Battlefield | Other (nur bei Art Token)
alter table public.cards add column if not exists bf_mode text;         -- extra (3. Battlefield) | overlay (über ein Battlefield gelegt)
alter table public.cards add column if not exists enters_ready boolean; -- true = kommt bereit, false = getappt, leer = Standard der Kartenart
