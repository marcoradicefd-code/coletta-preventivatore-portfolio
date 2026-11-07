-- ============================================================================
-- 0004_fondamenta_dati_veri.sql
--
-- Data: 2026-10-13 (L21, PR B, issue #70). Chiude le condizioni del verdetto
-- sulla #96 (osservazioni 1, 2-B, 3, 5) prima che entrino i dati veri.
--
-- Scritta e NON applicata da Claude Code. La applica Marco dal SQL Editor:
-- prima su coletta-dev, poi sulla produzione, PRIMA del merge (backup della
-- produzione prima, Database › Backups). Parte dallo schema della 0003 e dai
-- corpi vivi della produzione (`supabase/baseline/2026-10-13-specchio-prod.sql`),
-- non da quelli della 0001.
--
-- Cosa fa:
--   a. `check_email_domain` rifiuta anche le email NULL o vuote e confronta il
--      dominio in minuscolo (osservazione 1: il profilo lo crea un trigger che
--      lasciava passare le NULL);
--   b. `clienti.updated_by`, scritto dal trigger a ogni scrittura;
--   c. `clienti.codice_gestionale` immutabile dopo l'inserimento, se non è NULL
--      (è la chiave dell'import della PR C);
--   d. un preventivo annullato non si riscrive: `dati`, `cliente_id` e
--      `totale_imponibile` non cambiano più; lo stato sì (strada B del verdetto);
--   e. `numeri_assegnati`: chi ha chiesto quale numero; la revisione 0 entra
--      solo con un numero assegnato a chi salva, la revisione N solo dopo la
--      N-1 e con il cliente della revisione 0 (osservazione 3);
--   f. l'anno del numero: quello del server; il precedente solo fino al 31
--      gennaio; il successivo mai;
--   g. `registro_eliminazioni`: chi ha cancellato quale riga di `clienti` e
--      `preventivi`, e quando. Solo identificativi, nessun dato personale
--      (GDPR art. 5(2) e 30).
--
-- Una sola transazione, NON idempotente di proposito, come la 0003: se una
-- tabella nuova esiste già si ferma tutto e non cambia niente. Prima di creare
-- qualcosa controlla che chi applica abbia BYPASSRLS e che la 0003 ci sia.
-- `search_path = ''` e nomi qualificati in tutte le funzioni.
--
-- ────────────────────────────────────────────────────────────────────────────
-- COME VERIFICARLA (dopo l'applicazione, dal SQL Editor; incollare l'esito)
-- ────────────────────────────────────────────────────────────────────────────
-- 1) RLS attiva e forzata sulle cinque tabelle (atteso: t, t su cinque righe):
--      select relname, relrowsecurity, relforcerowsecurity
--      from pg_class
--      where oid in ('public.clienti'::regclass, 'public.preventivi'::regclass,
--                    'public.contatori_preventivi'::regclass,
--                    'public.numeri_assegnati'::regclass,
--                    'public.registro_eliminazioni'::regclass)
--      order by relname;
--
-- 2) Le policy delle cinque tabelle (atteso: 11 righe, tutte con roles =
--    {authenticated}: le 9 della 0003, più SELECT su numeri_assegnati (solo i
--    propri numeri) e SELECT su registro_eliminazioni (solo admin); nessuna
--    policy di scrittura sulle due tabelle nuove; nessuna policy per anon):
--      select tablename, policyname, cmd, roles, qual, with_check
--      from pg_policies
--      where schemaname = 'public'
--        and tablename in ('clienti', 'preventivi', 'contatori_preventivi',
--                          'numeri_assegnati', 'registro_eliminazioni')
--      order by tablename, cmd;
--
-- 3) Le policy di `profiles` (osservazione 1; atteso: una riga, SELECT,
--    roles = {authenticated}, qual = (auth.uid() = id); niente INSERT, UPDATE
--    o DELETE: il profilo lo crea solo il trigger, il ruolo lo cambia solo chi
--    scavalca l'RLS):
--      select policyname, cmd, roles, qual, with_check
--      from pg_policies
--      where schemaname = 'public' and tablename = 'profiles';
--
-- 4) Le funzioni (atteso: assegna_numero_preventivo, check_email_domain e
--    registra_eliminazione con prosecdef = t; imposta_audit_clienti e
--    controlla_preventivo con prosecdef = f; tutte con proconfig =
--    {search_path=""}; EXECUTE ad authenticated solo su
--    assegna_numero_preventivo, ad anon su nessuna):
--      select p.proname, p.prosecdef, p.proconfig, p.proacl
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and p.proname in ('assegna_numero_preventivo', 'imposta_audit_clienti',
--                          'controlla_preventivo', 'check_email_domain',
--                          'registra_eliminazione')
--      order by p.proname;
--      select p.proname,
--             has_function_privilege('anon', p.oid, 'execute') as anon,
--             has_function_privilege('authenticated', p.oid, 'execute') as authenticated
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and p.proname in ('assegna_numero_preventivo', 'imposta_audit_clienti',
--                          'controlla_preventivo', 'check_email_domain',
--                          'registra_eliminazione')
--      order by p.proname;
--
-- 5) I privilegi sulle tabelle (atteso: nessuna riga per anon; per
--    authenticated SELECT/INSERT/UPDATE/DELETE su clienti e preventivi, solo
--    SELECT su contatori_preventivi, numeri_assegnati e registro_eliminazioni;
--    niente TRUNCATE):
--      select grantee, table_name, privilege_type
--      from information_schema.role_table_grants
--      where table_schema = 'public'
--        and table_name in ('clienti', 'preventivi', 'contatori_preventivi',
--                           'numeri_assegnati', 'registro_eliminazioni')
--        and grantee in ('anon', 'authenticated')
--      order by grantee, table_name, privilege_type;
--
-- 6) I trigger (atteso: clienti_audit e clienti_registro_eliminazioni su
--    clienti, preventivi_controlli e preventivi_registro_eliminazioni su
--    preventivi; su auth.users enforce_email_domain e on_auth_user_created):
--      select tgrelid::regclass as tabella, tgname, tgfoid::regprocedure as funzione
--      from pg_trigger
--      where not tgisinternal
--        and tgrelid in ('public.clienti'::regclass, 'public.preventivi'::regclass,
--                        'auth.users'::regclass)
--      order by 1, 2;
--
-- 7) Il blocco di prova, SOLO su coletta-dev: tutto il file fra «PROVA: INIZIO»
--    e «PROVA: FINE» qui sotto, tolti i `--` iniziali. Usa un profilo `user` e
--    un profilo `admin` che esistono già (li cerca da sé), JWT simulati e solo
--    dati finti. Finisce SEMPRE con un errore voluto, `ESITO: …`: l'errore
--    annulla l'intera transazione, quindi non resta niente (né clienti, né
--    preventivi, né numeri, né righe del registro, né utenti). Atteso:
--    «ESITO: 46 prove su 46 come atteso.»; altrimenti l'elenco delle prove KO
--    con il codice ottenuto.
--    Dopo la 0006 questo blocco non si riesegue più: B1 e C4 scrivono il codice gestionale da user, che la 0006 rifiuta (42501), e le prove dopo cadono a catena.
--
-- PROVA: INIZIO
-- do $prova$
-- declare
--   v_user uuid;
--   v_admin uuid;
--   v_senza uuid := gen_random_uuid();
--   v_anno int := extract(year from (now() at time zone 'Europe/Rome'))::int;
--   v_gennaio boolean := extract(month from (now() at time zone 'Europe/Rome')) = 1;
--   v_u int;
--   n1 int;
--   n2 int;
--   c1 uuid := gen_random_uuid();
--   c2 uuid := gen_random_uuid();
--   p1 uuid := gen_random_uuid();
--   p2 uuid := gen_random_uuid();
--   p3 uuid := gen_random_uuid();
--   dati text := '''{"versione": 4}''::jsonb';
--   prove text[];
--   chi text;
--   atteso text;
--   v_int bigint;
--   ok int := 0;
--   ko int := 0;
--   esiti text[] := '{}';
-- begin
--   select id into v_user from public.profiles where role = 'user' order by created_at limit 1;
--   select id into v_admin from public.profiles where role = 'admin' order by created_at limit 1;
--   if v_user is null or v_admin is null then
--     raise exception 'Serve un profilo con role user e uno con role admin';
--   end if;
--   select coalesce(max(ultimo), 0) into v_u from public.contatori_preventivi where anno = v_anno;
--   n1 := v_u + 1;
--   n2 := v_u + 2;
--   prove := array[
--     -- a. dominio dell'email (inserimenti in auth.users, annullati alla fine)
--     array['postgres', 'A1 email NULL', 'insert into auth.users (id, email) values (gen_random_uuid(), null)', 'P0001'],
--     array['postgres', 'A2 email vuota', 'insert into auth.users (id, email) values (gen_random_uuid(), '''')', 'P0001'],
--     array['postgres', 'A3 altro dominio', 'insert into auth.users (id, email) values (gen_random_uuid(), ''prova@example.test'')', 'P0001'],
--     array['postgres', 'A4 due chiocciole', 'insert into auth.users (id, email) values (gen_random_uuid(), ''prova@colettaebanisteria.it@example.test'')', 'P0001'],
--     array['postgres', 'A5 dominio in maiuscolo', 'insert into auth.users (id, email) values (gen_random_uuid(), ''prova.finta@COLETTAEBANISTERIA.IT'')', '!P0001'],
--     -- b. updated_by (e created_by) li fissa il trigger, non il client
--     array['user', 'B1 insert cliente con updated_by di un altro', format('with x as (insert into public.clienti (id, ragione_sociale, codice_gestionale, updated_by, created_by) values (%L, ''Cliente Prova Srl'', ''PROVA-0004'', %L, %L) returning 1) select count(*) from x', c1, v_admin, v_admin), '=1'],
--     array['postgres', 'B2 created_by e updated_by = user', format('select count(*) from public.clienti where id = %L and created_by = %L and updated_by = %L', c1, v_user, v_user), '=1'],
--     array['admin', 'B3 update dell''admin', format('with x as (update public.clienti set telefono = ''000 0000000'' where id = %L returning 1) select count(*) from x', c1), '=1'],
--     array['postgres', 'B4 updated_by = admin, created_by resta user', format('select count(*) from public.clienti where id = %L and created_by = %L and updated_by = %L', c1, v_user, v_admin), '=1'],
--     -- c. codice gestionale immutabile
--     array['user', 'C1 cambia il codice', format('update public.clienti set codice_gestionale = ''PROVA-ALTRO'' where id = %L', c1), '23514'],
--     array['user', 'C2 toglie il codice', format('update public.clienti set codice_gestionale = null where id = %L', c1), '23514'],
--     array['user', 'C3 insert cliente senza codice', format('with x as (insert into public.clienti (id, ragione_sociale) values (%L, ''Altro Cliente Prova'') returning 1) select count(*) from x', c2), '=1'],
--     array['user', 'C4 codice dato a chi non lo aveva', format('with x as (update public.clienti set codice_gestionale = ''PROVA-0004-B'' where id = %L returning 1) select count(*) from x', c2), '=1'],
--     -- f. l'anno del numero
--     array['user', 'F1 anno successivo', format('select public.assegna_numero_preventivo(%s)', v_anno + 1), '22023'],
--     array['user', 'F2 anno precedente (ammesso solo a gennaio)', format('select public.assegna_numero_preventivo(%s)', v_anno - 1), case when v_gennaio then '!22023' else '22023' end],
--     array['user', 'F3 anno nullo', 'select public.assegna_numero_preventivo(null)', '22023'],
--     -- e. numeri assegnati a chi li ha chiesti
--     array['user', 'E1 primo numero', format('select public.assegna_numero_preventivo(%s)', v_anno), '=' || n1],
--     array['user', 'E2 secondo numero', format('select public.assegna_numero_preventivo(%s)', v_anno), '=' || n2],
--     array['user', 'E3 lo user vede i suoi numeri', format('select count(*) from public.numeri_assegnati where anno = %s and numero in (%s, %s) and assegnato_a = %L', v_anno, n1, n2, v_user), '=2'],
--     array['admin', 'E4 l''admin non vede i numeri dello user', format('select count(*) from public.numeri_assegnati where anno = %s and numero in (%s, %s)', v_anno, n1, n2), '=0'],
--     array['admin', 'E5 revisione 0 col numero di un altro', format('insert into public.preventivi (anno, numero, revisione, cliente_id, dati) values (%s, %s, 0, %L, %s)', v_anno, n2, c1, dati), '23514'],
--     array['user', 'E6 numero oltre il contatore', format('insert into public.preventivi (anno, numero, revisione, cliente_id, dati) values (%s, %s, 0, %L, %s)', v_anno, n2 + 1, c1, dati), '23514'],
--     array['user', 'E7 revisione 0 col proprio numero, created_by di un altro', format('with x as (insert into public.preventivi (id, anno, numero, revisione, cliente_id, dati, created_by, updated_by) values (%L, %s, %s, 0, %L, %s, %L, %L) returning 1) select count(*) from x', p1, v_anno, n1, c1, dati, v_admin, v_admin), '=1'],
--     array['postgres', 'E8 created_by e updated_by = user', format('select count(*) from public.preventivi where id = %L and created_by = %L and updated_by = %L', p1, v_user, v_user), '=1'],
--     array['user', 'E9 revisione 0 del secondo numero', format('with x as (insert into public.preventivi (id, anno, numero, revisione, cliente_id, dati) values (%L, %s, %s, 0, %L, %s) returning 1) select count(*) from x', p2, v_anno, n2, c1, dati), '=1'],
--     array['user', 'E10 revisione 2 senza la 1', format('insert into public.preventivi (anno, numero, revisione, cliente_id, dati) values (%s, %s, 2, %L, %s)', v_anno, n2, c1, dati), '23514'],
--     array['user', 'E11 revisione 1 con un altro cliente', format('insert into public.preventivi (anno, numero, revisione, cliente_id, dati) values (%s, %s, 1, %L, %s)', v_anno, n2, c2, dati), '23514'],
--     array['user', 'E12 revisione 1, stesso cliente', format('with x as (insert into public.preventivi (id, anno, numero, revisione, cliente_id, dati) values (%L, %s, %s, 1, %L, %s) returning 1) select count(*) from x', p3, v_anno, n2, c1, dati), '=1'],
--     array['user', 'E13 cambia il numero', format('update public.preventivi set numero = %s where id = %L', n2, p1), '23514'],
--     array['user', 'E14 cambia la revisione', format('update public.preventivi set revisione = 5 where id = %L', p1), '23514'],
--     array['user', 'E15 cambia l''anno', format('update public.preventivi set anno = %s where id = %L', v_anno - 1, p1), '23514'],
--     -- d. un annullato non si riscrive
--     array['user', 'D1 annulla', format('with x as (update public.preventivi set stato = ''annullato'' where id = %L returning 1) select count(*) from x', p1), '=1'],
--     array['user', 'D2 riscrive i dati di un annullato', format('update public.preventivi set dati = ''{"versione": 4, "altro": 1}''::jsonb where id = %L', p1), '23514'],
--     array['user', 'D3 cambia il cliente di un annullato', format('update public.preventivi set cliente_id = %L where id = %L', c2, p1), '23514'],
--     array['user', 'D4 cambia il totale di un annullato', format('update public.preventivi set totale_imponibile = 1 where id = %L', p1), '23514'],
--     array['user', 'D5 riapre e riscrive in una volta', format('update public.preventivi set stato = ''bozza'', dati = ''{"versione": 4, "altro": 2}''::jsonb where id = %L', p1), '23514'],
--     array['user', 'D6 cambia solo lo stato (ammesso)', format('with x as (update public.preventivi set stato = ''bozza'' where id = %L returning 1) select count(*) from x', p1), '=1'],
--     -- g. registro delle eliminazioni
--     array['user', 'G1 lo user non cancella', format('with x as (delete from public.preventivi where id = %L returning 1) select count(*) from x', p3), '=0'],
--     array['user', 'G2 lo user non scrive il registro', format('insert into public.registro_eliminazioni (tabella, id_riga) values (''clienti'', %L)', c1), '42501'],
--     array['admin', 'G3 l''admin cancella i preventivi', format('with x as (delete from public.preventivi where cliente_id = %L returning 1) select count(*) from x', c1), '=3'],
--     array['admin', 'G4 l''admin cancella i clienti', format('with x as (delete from public.clienti where id in (%L, %L) returning 1) select count(*) from x', c1, c2), '=2'],
--     array['admin', 'G5 il registro ha le cinque righe, con l''admin', format('select count(*) from public.registro_eliminazioni where eliminato_da = %L and ((tabella = ''preventivi'' and id_riga in (%L, %L, %L)) or (tabella = ''clienti'' and id_riga in (%L, %L)))', v_admin, p1, p2, p3, c1, c2), '=5'],
--     array['user', 'G6 lo user non legge il registro', 'select count(*) from public.registro_eliminazioni', '=0'],
--     array['admin', 'G7 nessuno riscrive il registro', 'delete from public.registro_eliminazioni', '42501'],
--     -- senza profilo e anon
--     array['senza', 'N1 senza profilo non legge i numeri', 'select count(*) from public.numeri_assegnati', '=0'],
--     array['anon', 'X1 anon e i numeri', 'select count(*) from public.numeri_assegnati', '42501']
--   ];
--   for i in 1 .. array_length(prove, 1) loop
--     chi := prove[i][1];
--     atteso := prove[i][4];
--     execute 'reset role';
--     if chi = 'postgres' then
--       perform set_config('request.jwt.claims', '', true);
--     elsif chi = 'anon' then
--       perform set_config('request.jwt.claims', '{"role":"anon"}', true);
--       execute 'set local role anon';
--     else
--       perform set_config('request.jwt.claims',
--         json_build_object('sub', case chi when 'user' then v_user when 'admin' then v_admin else v_senza end,
--                           'role', 'authenticated')::text, true);
--       execute 'set local role authenticated';
--     end if;
--     begin
--       if left(atteso, 1) = '=' then
--         execute prove[i][3] into v_int;
--         if v_int::text = substr(atteso, 2) then ok := ok + 1;
--         else ko := ko + 1; esiti := esiti || format('%s: %s invece di %s', prove[i][2], v_int, substr(atteso, 2));
--         end if;
--       else
--         execute prove[i][3];
--         if left(atteso, 1) = '!' then ok := ok + 1;
--         else ko := ko + 1; esiti := esiti || format('%s: accettata invece di %s', prove[i][2], atteso);
--         end if;
--       end if;
--     exception when others then
--       if sqlstate = atteso or (left(atteso, 1) = '!' and sqlstate <> substr(atteso, 2)) then ok := ok + 1;
--       else ko := ko + 1; esiti := esiti || format('%s: %s invece di %s', prove[i][2], sqlstate, atteso);
--       end if;
--     end;
--   end loop;
--   execute 'reset role';
--   raise exception 'ESITO: % prove su % come atteso.%', ok, ok + ko,
--     case when ko > 0 then ' KO: ' || array_to_string(esiti, ' | ') else '' end;
-- end
-- $prova$;
-- PROVA: FINE
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (togliere la 0004 senza toccare la 0003; il registro e i numeri
-- assegnati si perdono: prima un backup, Database › Backups)
-- ────────────────────────────────────────────────────────────────────────────
-- Se la 0006 è applicata, PRIMA il suo rollback (in testa al suo file).
-- Se la 0005 è applicata, PRIMA il suo rollback (in testa al suo file).
-- I corpi di `imposta_audit_clienti`, `controlla_preventivo` e
-- `assegna_numero_preventivo` tornano quelli della 0003 (rieseguire le tre
-- `create function` della 0003 come `create or replace function`), quello di
-- `check_email_domain` quello della baseline. Poi:
--      begin;
--      drop trigger if exists clienti_registro_eliminazioni on public.clienti;
--      drop trigger if exists preventivi_registro_eliminazioni on public.preventivi;
--      drop function if exists public.registra_eliminazione();
--      drop table if exists public.registro_eliminazioni;
--      drop table if exists public.numeri_assegnati;
--      alter table public.clienti drop column if exists updated_by;
--      commit;
--    Le tre funzioni si riportano alla 0003 PRIMA della drop di
--    `numeri_assegnati` e di `updated_by`, che i corpi della 0004 usano.
-- ============================================================================

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Precondizioni: chi applica scavalca l'RLS (come la 0003: le funzioni
--    SECURITY DEFINER scrivono tabelle senza policy di scrittura), e la 0003 è
--    già applicata.
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_roles
    where rolname = current_user and (rolbypassrls or rolsuper)
  ) then
    raise exception 'Il ruolo % non ha BYPASSRLS: le funzioni SECURITY DEFINER non potrebbero scrivere. Applicare come postgres.', current_user;
  end if;
  if to_regclass('public.preventivi') is null or to_regclass('public.contatori_preventivi') is null then
    raise exception 'La 0003 non è applicata: applicarla prima della 0004.';
  end if;
end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- a) check_email_domain (osservazione 1).
--
-- Il corpo vivo (baseline) usa `NEW.email NOT LIKE …`: con un'email NULL il
-- confronto è NULL, l'IF non scatta, l'utente entra e `handle_new_user` gli
-- crea il profilo, cioè l'accesso a clienti e preventivi. Qui:
--   - NULL e vuota si rifiutano;
--   - una chiocciola sola: con due, `split_part` leggerebbe come dominio la
--     parte di mezzo (`x@colettaebanisteria.it@altro.it`);
--   - il dominio si confronta in minuscolo.
-- Resta SECURITY DEFINER, come in produzione. `search_path` da `public, auth`
-- a '': il corpo usa solo funzioni di sistema, che `pg_catalog` trova sempre.
-- `create or replace` tiene proprietario e ACL della 0002 (EXECUTE solo a
-- postgres e service_role); la revoca qui sotto lo ripete.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.check_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null
     or new.email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
     or lower(split_part(new.email, '@', 2)) not in ('colettaebanisteria.it', 'luxuryacademy.online') then
    raise exception 'Registrazione non consentita per questo dominio email';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_email_domain() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- b) e c) clienti: chi ha modificato per ultimo, e il codice gestionale che
--    non cambia più una volta scritto.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.clienti
  add column updated_by uuid references auth.users (id) on delete set null;

create or replace function public.imposta_audit_clienti()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    -- c) La chiave di upsert dell'import (PR C): scritta una volta, resta.
    -- Da NULL si può scrivere (un cliente creato dall'app che l'import ritrova).
    if old.codice_gestionale is not null
       and new.codice_gestionale is distinct from old.codice_gestionale then
      raise exception 'Il codice gestionale di un cliente non cambia' using errcode = '23514';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- e) I numeri assegnati, e a chi.
--
-- Correzione del commento della 0003 sopra `controlla_preventivo` («un numero
-- inventato dal client non entra, e non può far scontrare un salvataggio
-- futuro»): non era vero. Il controllo era solo `numero <= ultimo`, quindi un
-- client modificato poteva prendere il numero già assegnato a un altro utente
-- (che poi riceveva 23505 al suo salvataggio), e inserire revisioni senza
-- quelle prima o con un altro cliente (verdetto sulla #96, osservazione 3).
--
-- La tabella la scrive solo `assegna_numero_preventivo`, nella stessa funzione
-- del contatore. Nessuna policy di scrittura; in lettura ognuno vede i propri
-- numeri, perché il trigger qui sotto è SECURITY INVOKER e li deve leggere.
-- ───────────────────────────────────────────────────────────────────────────
create table public.numeri_assegnati (
  anno int not null check (anno between 2000 and 2100),
  numero int not null check (numero > 0),
  assegnato_a uuid references auth.users (id) on delete set null,
  assegnato_il timestamptz not null default now(),
  primary key (anno, numero)
);

alter table public.numeri_assegnati enable row level security;
alter table public.numeri_assegnati force row level security;

create policy "Numeri assegnati: lettura dei propri, per chi ha un profilo"
  on public.numeri_assegnati for select to authenticated
  using (
    assegnato_a = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
  );

revoke all on table public.numeri_assegnati from anon;
revoke insert, update, delete, truncate, references, trigger on table public.numeri_assegnati from authenticated;

-- d) ed e) nel trigger dei preventivi.
--   INSERT: il numero non oltre il contatore (come la 0003), e in più:
--     - revisione 0: il numero è in `numeri_assegnati`, assegnato a chi salva;
--     - revisione N > 0: esiste la N-1 dello stesso anno e numero, e la
--       revisione 0 ha lo stesso cliente.
--   UPDATE: anno, numero e revisione non cambiano (come la 0003); un
--   preventivo annullato non cambia `dati`, `cliente_id` né
--   `totale_imponibile`. Lo stato sì: si può riaprire (residuo dichiarato
--   nella guida di sicurezza: riaprire e poi riscrivere sono due UPDATE).
create or replace function public.controlla_preventivo()
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
    if new.revisione = 0 then
      if not exists (
        select 1 from public.numeri_assegnati n
        where n.anno = new.anno and n.numero = new.numero and n.assegnato_a = auth.uid()
      ) then
        raise exception 'Numero di preventivo non assegnato a chi salva' using errcode = '23514';
      end if;
    elsif not exists (
        select 1 from public.preventivi p
        where p.anno = new.anno and p.numero = new.numero and p.revisione = new.revisione - 1
      )
      or not exists (
        select 1 from public.preventivi p
        where p.anno = new.anno and p.numero = new.numero and p.revisione = 0
          and p.cliente_id = new.cliente_id
      ) then
      raise exception 'Revisione senza la precedente, o con un altro cliente' using errcode = '23514';
    end if;
    new.created_at := now();
    new.created_by := auth.uid();
  else
    if new.anno is distinct from old.anno
       or new.numero is distinct from old.numero
       or new.revisione is distinct from old.revisione then
      raise exception 'Anno, numero e revisione di un preventivo non cambiano' using errcode = '23514';
    end if;
    if old.stato = 'annullato'
       and (new.dati is distinct from old.dati
            or new.cliente_id is distinct from old.cliente_id
            or new.totale_imponibile is distinct from old.totale_imponibile) then
      raise exception 'Un preventivo annullato non si riscrive' using errcode = '23514';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- f) Il numero: l'anno e chi lo ha chiesto.
--
-- L'anno: quello del server, letto nell'ora italiana (Coletta è a Bari: in UTC
-- l'1 gennaio fra mezzanotte e l'una sarebbe ancora l'anno prima). Il
-- precedente solo fino al 31 gennaio, per il preventivo a cavallo di
-- capodanno; il successivo mai (niente contatori aperti in anticipo).
-- Dopo il contatore, nella stessa funzione, il numero si scrive in
-- `numeri_assegnati` con chi lo ha chiesto.
-- `create or replace` tiene proprietario e ACL della 0003 (EXECUTE solo ad
-- authenticated); la revoca e il grant qui sotto lo ripetono.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.assegna_numero_preventivo(p_anno int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero int;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_anno_server int := extract(year from v_oggi)::int;
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles p where p.id = auth.uid()) then
    raise exception 'Operazione non consentita' using errcode = '42501';
  end if;

  if p_anno is null
     or not (p_anno = v_anno_server
             or (p_anno = v_anno_server - 1 and extract(month from v_oggi) = 1)) then
    raise exception 'Anno del preventivo non valido' using errcode = '22023';
  end if;

  insert into public.contatori_preventivi as c (anno, ultimo)
  values (p_anno, 1)
  on conflict (anno) do update set ultimo = c.ultimo + 1
  returning c.ultimo into v_numero;

  insert into public.numeri_assegnati (anno, numero, assegnato_a, assegnato_il)
  values (p_anno, v_numero, auth.uid(), now());

  return v_numero;
end;
$$;

revoke all on function public.assegna_numero_preventivo(int) from public, anon;
grant execute on function public.assegna_numero_preventivo(int) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- g) Registro delle eliminazioni (GDPR art. 5(2) e 30: chi ha cancellato cosa).
--
-- Solo identificativi: la tabella, l'id della riga, chi e quando. Nessun dato
-- personale del cliente (niente nome, niente copia della riga). Lo scrive solo
-- il trigger AFTER DELETE, SECURITY DEFINER perché il registro non ha policy di
-- scrittura per nessuno (precondizione al punto 0); lo legge solo l'admin.
-- `eliminato_da` senza FK: il registro resta anche se l'utente non c'è più.
-- ───────────────────────────────────────────────────────────────────────────
create table public.registro_eliminazioni (
  id bigint generated always as identity primary key,
  tabella text not null check (tabella in ('clienti', 'preventivi')),
  id_riga uuid not null,
  eliminato_da uuid,
  eliminato_il timestamptz not null default now()
);

alter table public.registro_eliminazioni enable row level security;
alter table public.registro_eliminazioni force row level security;

create policy "Registro eliminazioni: lettura solo admin"
  on public.registro_eliminazioni for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));

revoke all on table public.registro_eliminazioni from anon;
revoke insert, update, delete, truncate, references, trigger on table public.registro_eliminazioni from authenticated;

create function public.registra_eliminazione()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.registro_eliminazioni (tabella, id_riga, eliminato_da)
  values (tg_table_name, old.id, auth.uid());
  return old;
end;
$$;

create trigger clienti_registro_eliminazioni
  after delete on public.clienti
  for each row execute function public.registra_eliminazione();

create trigger preventivi_registro_eliminazioni
  after delete on public.preventivi
  for each row execute function public.registra_eliminazione();

-- Come le altre funzioni di trigger: nessuno le chiama via RPC. EXECUTE si
-- controlla solo a CREATE TRIGGER (vedi la 0002), quindi i trigger girano.
revoke execute on function public.registra_eliminazione() from public, anon, authenticated;
revoke execute on function public.imposta_audit_clienti() from public, anon, authenticated;
revoke execute on function public.controlla_preventivo() from public, anon, authenticated;

commit;
