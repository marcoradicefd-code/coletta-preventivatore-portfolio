-- ============================================================================
-- 0003_clienti_preventivi.sql
--
-- Data: 2026-10-13 (L21, PR A, issue #70).
--
-- Clienti e preventivi salvati nel database, con un numero annuale assegnato
-- dal server. Scritta e NON applicata da Claude Code: la applica Marco dal SQL
-- Editor del progetto Supabase (rule `auth-supabase`). Nessun dato: le tabelle
-- nascono vuote; l'anagrafica arriva con la PR B, dall'app.
--
-- Cosa crea:
--   - public.clienti               anagrafica (senza codice fiscale: decisione di
--                                  Marco del 12/10, minimizzazione, GDPR 5(1)(c));
--   - public.preventivi            un preventivo per (anno, numero, revisione),
--                                  lo stato del preventivo dell'app in `dati`;
--   - public.contatori_preventivi  l'ultimo numero assegnato per anno;
--   - public.assegna_numero_preventivo(int)  il numero, SECURITY DEFINER;
--   - due funzioni di trigger: audit (created/updated) e i controlli sul numero.
--
-- Una sola transazione, NON idempotente di proposito: se una tabella o una
-- funzione esiste già, si ferma tutto e non cambia niente (meglio un errore che
-- una tabella vecchia con una forma diversa tenuta in silenzio).
--
-- ────────────────────────────────────────────────────────────────────────────
-- COME VERIFICARLA (dopo l'applicazione, dal SQL Editor; incollare l'esito)
-- ────────────────────────────────────────────────────────────────────────────
-- 1) RLS attiva e forzata sulle tre tabelle (atteso: t, t su tre righe):
--      select relname, relrowsecurity, relforcerowsecurity
--      from pg_class
--      where oid in ('public.clienti'::regclass, 'public.preventivi'::regclass,
--                    'public.contatori_preventivi'::regclass);
--
-- 2) Le policy (atteso: 9 righe, tutte con roles = {authenticated};
--    clienti e preventivi: SELECT, INSERT, UPDATE, DELETE; contatori_preventivi:
--    solo SELECT; le due DELETE con role = 'admin' nella qual; nessuna policy
--    per anon):
--      select tablename, policyname, cmd, roles, qual, with_check
--      from pg_policies
--      where schemaname = 'public'
--        and tablename in ('clienti', 'preventivi', 'contatori_preventivi')
--      order by tablename, cmd;
--
-- 3) La funzione del numero (atteso: prosecdef = t, proconfig = {search_path=""},
--    anon = f, authenticated = t) e le funzioni di trigger (nessun EXECUTE a
--    anon né ad authenticated):
--      select p.proname, p.prosecdef, p.proconfig, p.proacl
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and p.proname in ('assegna_numero_preventivo', 'imposta_audit_clienti',
--                          'controlla_preventivo');
--      select has_function_privilege('anon', 'public.assegna_numero_preventivo(int)', 'execute') as anon,
--             has_function_privilege('authenticated', 'public.assegna_numero_preventivo(int)', 'execute') as authenticated;
--
-- 4) I privilegi sulle tabelle (atteso: nessuna riga per anon; per
--    authenticated SELECT/INSERT/UPDATE/DELETE su clienti e preventivi e solo
--    SELECT su contatori_preventivi; niente TRUNCATE):
--      select grantee, table_name, privilege_type
--      from information_schema.role_table_grants
--      where table_schema = 'public'
--        and table_name in ('clienti', 'preventivi', 'contatori_preventivi')
--        and grantee in ('anon', 'authenticated')
--      order by grantee, table_name, privilege_type;
--
-- 5) Prova con due utenti, dentro una transazione che si annulla (nessun dato
--    resta, nemmeno il contatore). Sostituire <UUID_USER> con l'id di un
--    profilo con role 'user' e <UUID_ADMIN> con quello di un admin
--    (select id, role from public.profiles). Dati finti.
--      begin;
--      select set_config('request.jwt.claims', '{"sub":"<UUID_USER>","role":"authenticated"}', true);
--      set local role authenticated;
--      select public.assegna_numero_preventivo(extract(year from now())::int);  -- un numero
--      insert into public.clienti (ragione_sociale) values ('Cliente Prova Srl');
--      select count(*) from public.clienti;                                      -- 1
--      delete from public.clienti where ragione_sociale = 'Cliente Prova Srl';   -- DELETE 0: lo user non cancella
--      reset role;
--      select set_config('request.jwt.claims', '{"sub":"<UUID_ADMIN>","role":"authenticated"}', true);
--      set local role authenticated;
--      delete from public.clienti where ragione_sociale = 'Cliente Prova Srl';   -- DELETE 1: l'admin sì
--      reset role;
--      select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
--      set local role authenticated;
--      select count(*) from public.contatori_preventivi;                         -- 0: senza profilo non legge niente
--      select public.assegna_numero_preventivo(extract(year from now())::int);  -- errore 42501
--      rollback;
--    E anon (atteso: permission denied su tutte e due):
--      begin; set local role anon; select count(*) from public.clienti; rollback;
--      begin; set local role anon; select public.assegna_numero_preventivo(2026); rollback;
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (cancella anche i dati: prima un backup, Database › Backups)
-- ────────────────────────────────────────────────────────────────────────────
-- Se le migration dopo questa sono applicate, PRIMA i loro rollback, dall'ultima
-- (0006, poi 0005, poi 0004: li trovi in testa ai loro file). Altrimenti questo rollback
-- finisce senza errori ma lascia oggetti della 0004 (`registra_eliminazione`,
-- `numeri_assegnati`, `registro_eliminazioni`) e il corpo nuovo di
-- `check_email_domain`.
--      begin;
--      drop table if exists public.preventivi;
--      drop table if exists public.contatori_preventivi;
--      drop table if exists public.clienti;
--      drop function if exists public.assegna_numero_preventivo(int);
--      drop function if exists public.controlla_preventivo();
--      drop function if exists public.imposta_audit_clienti();
--      commit;
--    I trigger cadono con le tabelle; le funzioni dopo, perché i trigger le usano.
-- ============================================================================

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Precondizione: chi applica deve scavalcare l'RLS.
--
-- Le tabelle hanno FORCE ROW LEVEL SECURITY, che vale anche per il
-- proprietario. La funzione del numero è SECURITY DEFINER e gira come il
-- proprietario (chi applica questo file, `postgres` dal SQL Editor): scrive in
-- `contatori_preventivi`, che non ha policy di scrittura, quindi funziona solo
-- se il proprietario ha BYPASSRLS. Se non ce l'ha, ci si ferma qui con un
-- messaggio invece di creare una funzione che fallisce al primo salvataggio.
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_roles
    where rolname = current_user and (rolbypassrls or rolsuper)
  ) then
    raise exception 'Il ruolo % non ha BYPASSRLS: la funzione del numero non potrebbe scrivere il contatore. Applicare come postgres.', current_user;
  end if;
end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Tabelle
-- ───────────────────────────────────────────────────────────────────────────

-- Anagrafica. `ragione_sociale` è il nome da mostrare (persona o azienda).
-- NIENTE codice fiscale: a un preventivo non serve (Marco, 12/10). I campi
-- liberi (`note`) non vanno usati per categorie particolari (art. 9): lo dice
-- la UI.
create table public.clienti (
  id uuid primary key default gen_random_uuid(),
  codice_gestionale text unique,
  ragione_sociale text not null check (length(btrim(ragione_sociale)) > 0),
  nome text,
  cognome text,
  telefono text,
  email text,
  indirizzo text,
  cap text,
  localita text,
  provincia text,
  partita_iva text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- Un preventivo per (anno, numero, revisione). `dati` è lo stato del preventivo
-- dell'app (`preventivo` + `sezioni` di quoteStore), con la versione del
-- formato (`QUOTE_VERSION`). Il numero lo assegna `assegna_numero_preventivo`
-- al primo salvataggio; una nuova revisione tiene anno e numero.
create table public.preventivi (
  id uuid primary key default gen_random_uuid(),
  anno int not null check (anno between 2000 and 2100),
  numero int not null check (numero > 0),
  revisione int not null default 0 check (revisione >= 0),
  cliente_id uuid not null references public.clienti (id) on delete restrict,
  stato text not null default 'bozza'
    check (stato in ('bozza', 'inviato', 'accettato', 'annullato')),
  dati jsonb not null,
  totale_imponibile numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  unique (anno, numero, revisione)
);

-- La FK `on delete restrict` controlla i preventivi del cliente a ogni DELETE.
create index preventivi_cliente_id_idx on public.preventivi (cliente_id);

-- L'ultimo numero assegnato per anno. Ci scrive solo la funzione del numero.
create table public.contatori_preventivi (
  anno int primary key check (anno between 2000 and 2100),
  ultimo int not null check (ultimo > 0)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RLS: enable + force su tutte e tre. Policy solo per `authenticated`, e
--    solo per chi ha un profilo; DELETE solo admin; nessuna policy per anon.
--    `(select auth.uid())` invece di `auth.uid()`: Postgres la valuta una volta
--    per query e non una per riga (raccomandazione Supabase sulle policy).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.clienti enable row level security;
alter table public.clienti force row level security;
alter table public.preventivi enable row level security;
alter table public.preventivi force row level security;
alter table public.contatori_preventivi enable row level security;
alter table public.contatori_preventivi force row level security;

-- clienti
create policy "Clienti: lettura per chi ha un profilo"
  on public.clienti for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

create policy "Clienti: inserimento per chi ha un profilo"
  on public.clienti for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

create policy "Clienti: modifica per chi ha un profilo"
  on public.clienti for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

create policy "Clienti: eliminazione solo admin"
  on public.clienti for delete to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));

-- preventivi
create policy "Preventivi: lettura per chi ha un profilo"
  on public.preventivi for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

create policy "Preventivi: inserimento per chi ha un profilo"
  on public.preventivi for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

create policy "Preventivi: modifica per chi ha un profilo"
  on public.preventivi for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

-- Nell'app «Elimina» è «Annulla» (stato = 'annullato'): la DELETE vera resta
-- all'admin, per gli errori.
create policy "Preventivi: eliminazione solo admin"
  on public.preventivi for delete to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));

-- contatori_preventivi: solo lettura (serve al controllo del numero
-- all'inserimento di un preventivo). Nessuna policy di scrittura, nemmeno per
-- l'admin: un contatore cancellato o abbassato farebbe riusare un numero.
create policy "Contatori: lettura per chi ha un profilo"
  on public.contatori_preventivi for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Privilegi sulle tabelle. Supabase dà per default tutti i privilegi ad
--    anon e authenticated sulle tabelle nuove di `public`: l'RLS basta a
--    negare, ma qui si toglie anche il privilegio (difesa in profondità).
--    TRUNCATE non passa dall'RLS: si toglie a tutti e due.
-- ───────────────────────────────────────────────────────────────────────────
revoke all on table public.clienti, public.preventivi, public.contatori_preventivi from anon;
revoke truncate, references, trigger on table public.clienti, public.preventivi, public.contatori_preventivi from authenticated;
revoke insert, update, delete on table public.contatori_preventivi from authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Trigger: audit (created_* fissati all'inserimento, updated_* a ogni
--    scrittura, il client non li sceglie) e, sui preventivi, i controlli sul
--    numero. SECURITY INVOKER: girano con i diritti di chi scrive.
-- ───────────────────────────────────────────────────────────────────────────
create function public.imposta_audit_clienti()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- All'inserimento il numero deve essere già stato assegnato dalla funzione
-- (non oltre l'ultimo del contatore): un numero inventato dal client non
-- entra, e non può far scontrare un salvataggio futuro. Dopo, anno, numero e
-- revisione non cambiano più.
create function public.controlla_preventivo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.contatori_preventivi c
      where c.anno = new.anno and new.numero <= c.ultimo
    ) then
      raise exception 'Numero di preventivo non assegnato' using errcode = '23514';
    end if;
    new.created_at := now();
    new.created_by := auth.uid();
  else
    if new.anno is distinct from old.anno
       or new.numero is distinct from old.numero
       or new.revisione is distinct from old.revisione then
      raise exception 'Anno, numero e revisione di un preventivo non cambiano' using errcode = '23514';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger clienti_audit
  before insert or update on public.clienti
  for each row execute function public.imposta_audit_clienti();

create trigger preventivi_controlli
  before insert or update on public.preventivi
  for each row execute function public.controlla_preventivo();

-- Come le funzioni di trigger della 0002: nessuno le chiama via RPC. EXECUTE
-- si controlla solo a CREATE TRIGGER, quindi i trigger continuano a girare.
revoke execute on function public.imposta_audit_clienti() from public, anon, authenticated;
revoke execute on function public.controlla_preventivo() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Il numero del preventivo.
--
-- Un'istruzione sola, atomica: `insert … on conflict (anno) do update … returning`.
-- Due salvataggi insieme si mettono in fila sul lock della riga dell'anno e
-- ricevono due numeri diversi; il primo dell'anno crea la riga con 1. Il
-- numero si assegna al primo salvataggio, non cambia più e non si riusa (il
-- contatore non scende mai: nessuna policy di scrittura). Un preventivo
-- annullato tiene il suo numero.
--
-- SECURITY DEFINER perché `contatori_preventivi` non ha policy di scrittura per
-- gli utenti: scrive il proprietario della funzione (precondizione al punto 0).
-- `search_path = ''` e nomi qualificati `public.`/`auth.`: un oggetto con lo
-- stesso nome in uno schema dell'utente non può prendere il posto di quelli
-- veri dentro una funzione che gira con i diritti del proprietario.
-- Dentro controlla che chi chiama abbia un profilo, come le policy.
--
-- L'anno: entro un anno da quello del server, per il preventivo fatto a
-- cavallo di capodanno; un anno lontano non si apre (niente contatori a caso).
--
-- EXECUTE: tolto a PUBLIC e ad anon, dato solo ad authenticated. Coerente con la
-- 0002, che lo ha tolto alle altre SECURITY DEFINER (lint Supabase 0028/0029):
-- PUBLIC è il default globale di Postgres su ogni funzione nuova, quindi
-- togliere solo anon non basterebbe. Qui authenticated lo tiene perché la
-- funzione serve all'app; il controllo del profilo sta dentro.
-- ───────────────────────────────────────────────────────────────────────────
create function public.assegna_numero_preventivo(p_anno int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero int;
  v_anno_server int := extract(year from now())::int;
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles p where p.id = auth.uid()) then
    raise exception 'Operazione non consentita' using errcode = '42501';
  end if;

  if p_anno is null or p_anno < v_anno_server - 1 or p_anno > v_anno_server + 1 then
    raise exception 'Anno del preventivo non valido' using errcode = '22023';
  end if;

  insert into public.contatori_preventivi as c (anno, ultimo)
  values (p_anno, 1)
  on conflict (anno) do update set ultimo = c.ultimo + 1
  returning c.ultimo into v_numero;

  return v_numero;
end;
$$;

revoke all on function public.assegna_numero_preventivo(int) from public, anon;
grant execute on function public.assegna_numero_preventivo(int) to authenticated;

commit;
