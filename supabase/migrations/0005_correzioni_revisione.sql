-- ============================================================================
-- 0005_correzioni_revisione.sql
--
-- Data: 2026-10-14 (L22, issue #70). Chiude i difetti di database della
-- revisione L15-L21 (commenti sulla #70: sicurezza 6164175247, calcoli
-- 6164175512) e le due regole della strada A decise da Marco il 14/10.
--
-- Scritta e NON applicata da Claude Code. La applica Marco dal SQL Editor:
-- prima su coletta-dev (con il blocco di prova qui sotto), poi sulla
-- produzione, PRIMA del merge (backup della produzione prima, Database ›
-- Backups). Parte dalla 0004.
--
-- Cosa fa:
--   S10. `profiles` (la fonte dei ruoli): via ogni privilegio ad anon, e ad
--        authenticated tutto tranne SELECT. Oggi la difende solo l'RLS.
--   S2.  `check_email_domain`: l'email dev'essere ASCII prima del confronto sul
--        dominio, e il minuscolo è quello di "C" (solo ASCII). Con un locale
--        Unicode `lower()` piega la I turca con il punto (U+0130) in `i`, quindi un dominio
--        scritto con quella lettera al posto della `i` di «ebanisteria» passava.
--   S1.  `imposta_audit_clienti` e `controlla_preventivo`: l'UPDATE prodotto da
--        `on delete set null` (cancellazione di un utente) porta `created_by` a
--        NULL. Prima il trigger lo riscriveva col vecchio valore: riga con un
--        `created_by` orfano, e un dump che non si ripristina.
--   S6.  Un numero il cui preventivo è stato eliminato da un admin non si
--        riusa: `numeri_assegnati.eliminato_il`, scritta dal trigger del
--        registro delle eliminazioni; la revisione 0 non entra su un numero
--        eliminato.
--   S7.  All'UPDATE, il cliente di un preventivo con più revisioni non cambia
--        (all'INSERT lo controllava già la 0004).
--   A.   Strada A (Marco, 14/10):
--        - un preventivo `inviato` o `accettato` non cambia `dati`,
--          `cliente_id` né `totale_imponibile`, se non per mano di un admin
--          (23514); per chi non è admin lo stato va solo avanti (inviato →
--          accettato o annullato, accettato → annullato);
--        - un `annullato` si riapre (cambia stato) solo per mano di un admin.
--          Chiude il residuo «annullato riapribile in due passi» della guida
--          di sicurezza.
--   S11. `nuovo_numero_preventivo()`: anno (di Roma, letto dal server) e
--        numero in una chiamata; il client non manda più l'anno.
--   S9.  Il rollback è in testa a questo file; quello della 0003 e della 0004
--        dicono di togliere prima le migration dopo.
--
-- Una sola transazione, NON idempotente di proposito, come la 0003 e la 0004:
-- se la colonna nuova esiste già si ferma tutto e non cambia niente. Prima di
-- toccare qualcosa controlla che chi applica abbia BYPASSRLS e che la 0004 ci
-- sia. `search_path = ''` e nomi qualificati in tutte le funzioni. Nessuna
-- DROP: le funzioni cambiano con `create or replace`, che tiene proprietario e
-- ACL.
--
-- Dopo la 0005 il blocco di prova della 0004 non vale più per intero: la sua
-- D6 («un annullato cambia solo lo stato», da user) ora è rifiutata, come
-- vuole la strada A. Il blocco qui sotto la sostituisce.
--
-- ────────────────────────────────────────────────────────────────────────────
-- COME VERIFICARLA (dopo l'applicazione, dal SQL Editor; incollare l'esito)
-- ────────────────────────────────────────────────────────────────────────────
-- 1) I privilegi su `profiles` (atteso: nessuna riga per anon; per
--    authenticated solo SELECT):
--      select grantee, privilege_type
--      from information_schema.role_table_grants
--      where table_schema = 'public' and table_name = 'profiles'
--        and grantee in ('anon', 'authenticated')
--      order by grantee, privilege_type;
--
-- 2) Le funzioni (atteso: check_email_domain e registra_eliminazione con
--    prosecdef = t; imposta_audit_clienti, controlla_preventivo e
--    nuovo_numero_preventivo con prosecdef = f; tutte con proconfig =
--    {search_path=""}; nessun EXECUTE ad anon; ad authenticated solo su
--    nuovo_numero_preventivo):
--      select p.proname, p.prosecdef, p.proconfig,
--             has_function_privilege('anon', p.oid, 'execute') as anon,
--             has_function_privilege('authenticated', p.oid, 'execute') as authenticated
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and p.proname in ('check_email_domain', 'imposta_audit_clienti',
--                          'controlla_preventivo', 'registra_eliminazione',
--                          'nuovo_numero_preventivo')
--      order by p.proname;
--
-- 3) La colonna nuova (atteso: una riga, timestamp with time zone, YES):
--      select column_name, data_type, is_nullable
--      from information_schema.columns
--      where table_schema = 'public' and table_name = 'numeri_assegnati'
--        and column_name = 'eliminato_il';
--
-- 4) Il locale del database, per S2 (informativo: con la 0005 l'esito non
--    dipende più da lì):
--      select datctype, lower(chr(304)) = 'i' as piega_la_i_turca
--      from pg_database where datname = current_database();
--
-- 5) Il blocco di prova, SOLO su coletta-dev: tutto il file fra «PROVA: INIZIO»
--    e «PROVA: FINE» qui sotto, tolti i `--` iniziali. Usa un profilo `user` e
--    un profilo `admin` che esistono già (li cerca da sé), JWT simulati e solo
--    dati finti (email `@colettaebanisteria.it` di prova, «Cliente Prova»). Crea e
--    cancella anche un utente di prova in `auth.users`. Finisce SEMPRE con un
--    errore voluto, `ESITO: …`: l'errore annulla l'intera transazione, quindi
--    non resta niente (né utenti, né clienti, né preventivi, né numeri, né
--    righe del registro). Atteso: «ESITO: 53 prove su 53 come atteso.»;
--    altrimenti l'elenco delle prove KO con il codice ottenuto.
--
-- PROVA: INIZIO
-- do $prova$
-- declare
--   v_user uuid;
--   v_admin uuid;
--   v_tmp uuid := gen_random_uuid();
--   v_senza uuid := gen_random_uuid();
--   v_anno int := extract(year from (now() at time zone 'Europe/Rome'))::int;
--   v_u int;
--   n1 int;
--   n2 int;
--   n3 int;
--   n4 int;
--   c1 uuid := gen_random_uuid();
--   c2 uuid := gen_random_uuid();
--   c3 uuid := gen_random_uuid();
--   p1 uuid := gen_random_uuid();
--   p2 uuid := gen_random_uuid();
--   p3 uuid := gen_random_uuid();
--   p4 uuid := gen_random_uuid();
--   p5 uuid := gen_random_uuid();
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
--   n3 := v_u + 3;
--   n4 := v_u + 4;
--   prove := array[
--     -- S10. profiles: niente ad anon, solo SELECT ad authenticated
--     array['anon', 'S10a anon non legge profiles', 'select count(*) from public.profiles', '42501'],
--     array['user', 'S10b lo user non si promuove', format('update public.profiles set role = ''admin'' where id = %L', v_user), '42501'],
--     array['user', 'S10c lo user legge il proprio profilo', 'select count(*) from public.profiles', '=1'],
--     -- S2. email ASCII, dominio confrontato in "C"
--     array['postgres', 'S2a dominio con la I turca (U+0130)', 'insert into auth.users (id, email) values (gen_random_uuid(), ''prova.finta.s2@colettaeban'' || chr(304) || ''steria.it'')', 'P0001'],
--     array['postgres', 'S2b dominio con la a cirillica (U+0430)', 'insert into auth.users (id, email) values (gen_random_uuid(), ''prova.finta.s2@coletta'' || chr(1072) || ''ebanisteria.it'')', 'P0001'],
--     array['postgres', 'S2c secondo dominio con la I turca', 'insert into auth.users (id, email) values (gen_random_uuid(), ''prova.finta.s2@luxuryacademy.onl'' || chr(304) || ''ne'')', 'P0001'],
--     array['postgres', 'S2d nome con la I turca', 'insert into auth.users (id, email) values (gen_random_uuid(), ''prova.f'' || chr(304) || ''nta@colettaebanisteria.it'')', 'P0001'],
--     array['postgres', 'S2e ASCII in maiuscolo (ammesso)', 'insert into auth.users (id, email) values (gen_random_uuid(), ''prova.finta.s2e@COLETTAEBANISTERIA.IT'')', '!P0001'],
--     array['postgres', 'S2f apostrofo prima della chiocciola (ammesso)', 'insert into auth.users (id, email) values (gen_random_uuid(), ''prova.d'' || chr(39) || ''amico.s2f@colettaebanisteria.it'')', '!P0001'],
--     -- S1. cancellare un utente porta created_by a NULL (on delete set null)
--     array['postgres', 'S1a utente di prova', format('with x as (insert into auth.users (id, email) values (%L, ''prova.finta.s1@colettaebanisteria.it'') returning 1) select count(*) from x', v_tmp), '=1'],
--     array['tmp', 'S1b cliente dell''utente di prova', format('with x as (insert into public.clienti (id, ragione_sociale) values (%L, ''Cliente Prova S1'') returning 1) select count(*) from x', c3), '=1'],
--     array['user', 'S1c numero 1 dello user', format('select public.assegna_numero_preventivo(%s)', v_anno), '=' || n1],
--     array['user', 'S1d numero 2 dello user', format('select public.assegna_numero_preventivo(%s)', v_anno), '=' || n2],
--     array['user', 'S1e numero 3 dello user', format('select public.assegna_numero_preventivo(%s)', v_anno), '=' || n3],
--     array['tmp', 'S1f numero dell''utente di prova', format('select public.assegna_numero_preventivo(%s)', v_anno), '=' || n4],
--     array['tmp', 'S1g preventivo dell''utente di prova', format('with x as (insert into public.preventivi (id, anno, numero, revisione, cliente_id, dati) values (%L, %s, %s, 0, %L, %s) returning 1) select count(*) from x', p4, v_anno, n4, c3, dati), '=1'],
--     array['user', 'S11a il server sceglie anno e numero', 'select numero from public.nuovo_numero_preventivo()', '=' || (v_u + 5)],
--     array['user', 'S11b l''anno è quello di Roma', 'select anno from public.nuovo_numero_preventivo()', '=' || v_anno],
--     array['anon', 'S11c anon non chiede numeri', 'select numero from public.nuovo_numero_preventivo()', '42501'],
--     array['senza', 'S11d senza profilo non chiede numeri', 'select numero from public.nuovo_numero_preventivo()', '42501'],
--     array['postgres', 'S1h cancella l''utente di prova', format('with x as (delete from auth.users where id = %L returning 1) select count(*) from x', v_tmp), '=1'],
--     array['postgres', 'S1i created_by NULL sul cliente', format('select count(*) from public.clienti where id = %L and created_by is null and updated_by is null', c3), '=1'],
--     array['postgres', 'S1j created_by NULL sul preventivo', format('select count(*) from public.preventivi where id = %L and created_by is null and updated_by is null', p4), '=1'],
--     array['user', 'S1k cliente dello user', format('with x as (insert into public.clienti (id, ragione_sociale) values (%L, ''Cliente Prova Uno'') returning 1) select count(*) from x', c1), '=1'],
--     array['user', 'S1l lo user prova ad azzerare created_by', format('update public.clienti set created_by = null where id = %L', c1), '!'],
--     array['postgres', 'S1m created_by resta dello user', format('select count(*) from public.clienti where id = %L and created_by = %L', c1, v_user), '=1'],
--     -- S7. il cliente di un preventivo con più revisioni non cambia
--     array['user', 'S7a secondo cliente', format('with x as (insert into public.clienti (id, ragione_sociale) values (%L, ''Cliente Prova Due'') returning 1) select count(*) from x', c2), '=1'],
--     array['user', 'S7b revisione 0 del numero 2', format('with x as (insert into public.preventivi (id, anno, numero, revisione, cliente_id, dati) values (%L, %s, %s, 0, %L, %s) returning 1) select count(*) from x', p2, v_anno, n2, c1, dati), '=1'],
--     array['user', 'S7c revisione 1, stesso cliente', format('with x as (insert into public.preventivi (id, anno, numero, revisione, cliente_id, dati) values (%L, %s, %s, 1, %L, %s) returning 1) select count(*) from x', p3, v_anno, n2, c1, dati), '=1'],
--     array['user', 'S7d la revisione 1 cambia cliente', format('update public.preventivi set cliente_id = %L where id = %L', c2, p3), '23514'],
--     array['user', 'S7e la revisione 0 cambia cliente', format('update public.preventivi set cliente_id = %L where id = %L', c2, p2), '23514'],
--     array['user', 'S7f un preventivo senza revisioni cambia cliente (ammesso)', format('with x as (insert into public.preventivi (id, anno, numero, revisione, cliente_id, dati) values (%L, %s, %s, 0, %L, %s) returning 1) select count(*) from x', p1, v_anno, n1, c1, dati), '=1'],
--     array['user', 'S7g …e lo cambia', format('with x as (update public.preventivi set cliente_id = %L where id = %L returning 1) select count(*) from x', c2, p1), '=1'],
--     -- A. strada A: inviato e accettato non si riscrivono, annullato lo riapre solo l'admin
--     array['user', 'A1 inviato', format('with x as (update public.preventivi set stato = ''inviato'' where id = %L returning 1) select count(*) from x', p1), '=1'],
--     array['user', 'A2 riscrive i dati di un inviato', format('update public.preventivi set dati = ''{"versione": 4, "altro": 1}''::jsonb where id = %L', p1), '23514'],
--     array['user', 'A3 cambia il totale di un inviato', format('update public.preventivi set totale_imponibile = 1 where id = %L', p1), '23514'],
--     array['user', 'A4 cambia il cliente di un inviato', format('update public.preventivi set cliente_id = %L where id = %L', c1, p1), '23514'],
--     array['user', 'A4b due passi: lo user porta un inviato in bozza', format('update public.preventivi set stato = ''bozza'' where id = %L', p1), '23514'],
--     array['user', 'A4c …e poi ne riscrive i dati', format('update public.preventivi set dati = ''{"versione": 4, "due passi": 1}''::jsonb where id = %L', p1), '23514'],
--     array['postgres', 'A4d il preventivo è ancora inviato, coi dati di prima', format('select count(*) from public.preventivi where id = %L and stato = ''inviato'' and dati = %s', p1, dati), '=1'],
--     array['user', 'A5 da inviato ad accettato (ammesso)', format('with x as (update public.preventivi set stato = ''accettato'' where id = %L returning 1) select count(*) from x', p1), '=1'],
--     array['user', 'A5b da accettato a inviato (indietro)', format('update public.preventivi set stato = ''inviato'' where id = %L', p1), '23514'],
--     array['user', 'A6 da accettato a bozza', format('update public.preventivi set stato = ''bozza'' where id = %L', p1), '23514'],
--     array['admin', 'A7 l''admin corregge un accettato', format('with x as (update public.preventivi set dati = ''{"versione": 4, "corretto": 1}''::jsonb, totale_imponibile = 1 where id = %L returning 1) select count(*) from x', p1), '=1'],
--     array['user', 'A8 annulla', format('with x as (update public.preventivi set stato = ''annullato'' where id = %L returning 1) select count(*) from x', p1), '=1'],
--     array['user', 'A9 lo user riapre un annullato', format('update public.preventivi set stato = ''bozza'' where id = %L', p1), '23514'],
--     array['user', 'A9b lo user porta un annullato a inviato', format('update public.preventivi set stato = ''inviato'' where id = %L', p1), '23514'],
--     array['admin', 'A10 l''admin lo riapre', format('with x as (update public.preventivi set stato = ''bozza'' where id = %L returning 1) select count(*) from x', p1), '=1'],
--     -- S6. un numero eliminato dall'admin non si riusa
--     array['user', 'S6a revisione 0 del numero 3', format('with x as (insert into public.preventivi (id, anno, numero, revisione, cliente_id, dati) values (%L, %s, %s, 0, %L, %s) returning 1) select count(*) from x', p5, v_anno, n3, c1, dati), '=1'],
--     array['user', 'S6b lo stesso INSERT ripetuto (risposta persa): unicità, non 23514', format('insert into public.preventivi (id, anno, numero, revisione, cliente_id, dati) values (%L, %s, %s, 0, %L, %s)', p5, v_anno, n3, c1, dati), '23505'],
--     array['admin', 'S6c l''admin lo elimina', format('with x as (delete from public.preventivi where id = %L returning 1) select count(*) from x', p5), '=1'],
--     array['user', 'S6d lo user riusa il numero eliminato', format('insert into public.preventivi (anno, numero, revisione, cliente_id, dati) values (%s, %s, 0, %L, %s)', v_anno, n3, c2, dati), '23514'],
--     -- S10, per ultima: TRUNCATE non passa dall'RLS
--     array['user', 'S10d lo user non svuota profiles', 'truncate public.profiles', '42501']
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
--         json_build_object('sub', case chi when 'user' then v_user when 'admin' then v_admin when 'tmp' then v_tmp else v_senza end,
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
--       if sqlstate = atteso or (left(atteso, 1) = '!' and atteso <> '!' and sqlstate <> substr(atteso, 2)) then ok := ok + 1;
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
-- Nel blocco, `!` da solo vuol dire «accettata senza errore» (S1l: l'UPDATE
-- passa, ma `created_by` resta, come dice S1m); `!P0001` vuol dire «qualunque
-- esito tranne P0001».
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (togliere la 0005 senza toccare la 0004; la colonna
-- `numeri_assegnati.eliminato_il` si perde: prima un backup, Database ›
-- Backups)
-- ────────────────────────────────────────────────────────────────────────────
-- Se la 0006 è applicata, PRIMA il suo rollback (in testa al suo file).
-- Tutto il testo fra «ROLLBACK: INIZIO» e «ROLLBACK: FINE», tolti i `--`
-- iniziali, si esegue così com'è dal SQL Editor, in una transazione:
--   - le quattro funzioni tornano ai corpi della 0004, tutte con
--     `create or replace` (che tiene proprietario e ACL). Nella 0004
--     `registra_eliminazione` è una `create function`: rieseguita così dopo la
--     0005 fallisce con «already exists» e ferma il rollback a metà (verdetto
--     sulla #98, N3);
--   - poi la funzione nuova, la colonna e il grant. Le funzioni tornano alla
--     0004 PRIMA della drop della colonna, che i corpi della 0005 usano. La
--     `grant` riporta `profiles` ai privilegi di default di Supabase, quelli di
--     prima della 0005.
-- Provato su PGlite: dopo la 0005 e questo testo, funzioni (corpi, DEFINER,
-- search_path, ACL), colonne, grant delle tabelle e trigger sono quelli della
-- sola 0004.
--
-- ROLLBACK: INIZIO
-- begin;
--
-- create or replace function public.check_email_domain()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = ''
-- as $$
-- begin
--   if new.email is null
--      or new.email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
--      or lower(split_part(new.email, '@', 2)) not in ('colettaebanisteria.it', 'luxuryacademy.online') then
--     raise exception 'Registrazione non consentita per questo dominio email';
--   end if;
--   return new;
-- end;
-- $$;
--
-- create or replace function public.imposta_audit_clienti()
-- returns trigger
-- language plpgsql
-- set search_path = ''
-- as $$
-- begin
--   if tg_op = 'INSERT' then
--     new.created_at := now();
--     new.created_by := auth.uid();
--   else
--     -- c) La chiave di upsert dell'import (PR C): scritta una volta, resta.
--     -- Da NULL si può scrivere (un cliente creato dall'app che l'import ritrova).
--     if old.codice_gestionale is not null
--        and new.codice_gestionale is distinct from old.codice_gestionale then
--       raise exception 'Il codice gestionale di un cliente non cambia' using errcode = '23514';
--     end if;
--     new.created_at := old.created_at;
--     new.created_by := old.created_by;
--   end if;
--   new.updated_at := now();
--   new.updated_by := auth.uid();
--   return new;
-- end;
-- $$;
--
-- create or replace function public.controlla_preventivo()
-- returns trigger
-- language plpgsql
-- set search_path = ''
-- as $$
-- begin
--   if tg_op = 'INSERT' then
--     if not exists (
--       select 1 from public.contatori_preventivi c
--       where c.anno = new.anno and new.numero <= c.ultimo
--     ) then
--       raise exception 'Numero di preventivo non assegnato' using errcode = '23514';
--     end if;
--     if new.revisione = 0 then
--       if not exists (
--         select 1 from public.numeri_assegnati n
--         where n.anno = new.anno and n.numero = new.numero and n.assegnato_a = auth.uid()
--       ) then
--         raise exception 'Numero di preventivo non assegnato a chi salva' using errcode = '23514';
--       end if;
--     elsif not exists (
--         select 1 from public.preventivi p
--         where p.anno = new.anno and p.numero = new.numero and p.revisione = new.revisione - 1
--       )
--       or not exists (
--         select 1 from public.preventivi p
--         where p.anno = new.anno and p.numero = new.numero and p.revisione = 0
--           and p.cliente_id = new.cliente_id
--       ) then
--       raise exception 'Revisione senza la precedente, o con un altro cliente' using errcode = '23514';
--     end if;
--     new.created_at := now();
--     new.created_by := auth.uid();
--   else
--     if new.anno is distinct from old.anno
--        or new.numero is distinct from old.numero
--        or new.revisione is distinct from old.revisione then
--       raise exception 'Anno, numero e revisione di un preventivo non cambiano' using errcode = '23514';
--     end if;
--     if old.stato = 'annullato'
--        and (new.dati is distinct from old.dati
--             or new.cliente_id is distinct from old.cliente_id
--             or new.totale_imponibile is distinct from old.totale_imponibile) then
--       raise exception 'Un preventivo annullato non si riscrive' using errcode = '23514';
--     end if;
--     new.created_at := old.created_at;
--     new.created_by := old.created_by;
--   end if;
--   new.updated_at := now();
--   new.updated_by := auth.uid();
--   return new;
-- end;
-- $$;
--
-- create or replace function public.registra_eliminazione()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = ''
-- as $$
-- begin
--   insert into public.registro_eliminazioni (tabella, id_riga, eliminato_da)
--   values (tg_table_name, old.id, auth.uid());
--   return old;
-- end;
-- $$;
--
-- drop function if exists public.nuovo_numero_preventivo();
-- alter table public.numeri_assegnati drop column if exists eliminato_il;
-- grant all on table public.profiles to anon, authenticated;
--
-- commit;
-- ROLLBACK: FINE
-- ============================================================================

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Precondizioni: chi applica scavalca l'RLS (come la 0003 e la 0004), e la
--    0004 è già applicata.
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_roles
    where rolname = current_user and (rolbypassrls or rolsuper)
  ) then
    raise exception 'Il ruolo % non ha BYPASSRLS: applicare come postgres.', current_user;
  end if;
  if to_regclass('public.numeri_assegnati') is null or to_regclass('public.registro_eliminazioni') is null then
    raise exception 'La 0004 non è applicata: applicarla prima della 0005.';
  end if;
end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- S10) `profiles`: difesa in profondità sui privilegi, come la 0003 e la 0004
-- fanno sulle tabelle nuove. Il ruolo (`profiles.role`) decide chi è admin:
-- oggi anon e authenticated hanno ALL (privilegi di default di Supabase) e la
-- difende solo l'assenza di policy di scrittura. TRUNCATE non passa dall'RLS.
-- `handle_new_user` è SECURITY DEFINER e non ne risente; le policy dello
-- storage leggono `profiles` con SELECT, che resta ad authenticated.
-- ───────────────────────────────────────────────────────────────────────────
revoke all on table public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on table public.profiles from authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- S2) check_email_domain: solo email ASCII, poi il dominio in minuscolo "C".
--
-- Con un `lc_ctype` Unicode `lower()` usa la mappatura Unicode, e due code
-- point fuori dall'ASCII si piegano su lettere ASCII: la I turca con il punto (U+0130) in `i` e il
-- segno Kelvin (U+212A) in `k`. Un dominio scritto con la U+0130 al posto della
-- `i` diventava quello vero. Qui l'email deve essere tutta ASCII (lettere, cifre e
-- `._%+'-` prima della chiocciola, lettere, cifre, `.` e `-` dopo), e il
-- minuscolo è quello della collation "C", che tocca solo l'ASCII.
-- L'apostrofo (scritto `''` nel letterale) sta nella classe per i cognomi come
-- d'Amico (verdetto sulla #98, N4): è ASCII, quindi non riapre S2.
-- Resta SECURITY DEFINER, `search_path` vuoto, ACL della 0002.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.check_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null
     or new.email !~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9.-]+$'
     or lower(split_part(new.email, '@', 2) collate "C") not in ('colettaebanisteria.it', 'luxuryacademy.online') then
    raise exception 'Registrazione non consentita per questo dominio email';
  end if;
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- S1) Clienti: `created_by` a NULL quando lo porta lì `on delete set null`.
--
-- Cancellare un utente fa eseguire a Postgres l'azione referenziale: un UPDATE
-- che mette NULL in `created_by`. È l'unico UPDATE che arriva dentro un altro
-- trigger (`pg_trigger_depth() > 1`): l'azione referenziale è essa stessa un
-- trigger. Lì il NULL passa; un utente che scrive NULL da sé (profondità 1)
-- lo vede ancora rimesso al valore di prima.
-- Resta il resto della 0004: codice gestionale immutabile, `updated_*` dal
-- trigger.
-- ───────────────────────────────────────────────────────────────────────────
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
    if old.codice_gestionale is not null
       and new.codice_gestionale is distinct from old.codice_gestionale then
      raise exception 'Il codice gestionale di un cliente non cambia' using errcode = '23514';
    end if;
    new.created_at := old.created_at;
    if not (new.created_by is null and pg_trigger_depth() > 1) then
      new.created_by := old.created_by;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- S6) Un numero eliminato non si riusa.
--
-- Quando un admin elimina un preventivo, il trigger del registro (già
-- SECURITY DEFINER, già sulla DELETE) segna il numero in `numeri_assegnati`
-- con `eliminato_il`. La revisione 0 entra solo su un numero assegnato a chi
-- salva e mai eliminato: il PDF del numero eliminato può essere già uscito, e
-- un preventivo diverso con lo stesso numero non deve nascere.
-- Scelto il segno sul numero, e non una lettura del registro dal trigger dei
-- preventivi: il trigger dei preventivi è SECURITY INVOKER e il registro lo
-- legge solo l'admin, quindi servirebbe una funzione DEFINER nuova chiamabile
-- via RPC (che direbbe a chiunque quali numeri sono stati eliminati). Così
-- invece non nasce nessuna funzione nuova: chi salva legge solo i propri
-- numeri, come già fa per la revisione 0. Il primo salvataggio idempotente non
-- cambia: un INSERT ripetuto dopo una risposta persa trova il numero non
-- eliminato e si ferma sull'unicità dell'id (23505), come prima.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.numeri_assegnati add column eliminato_il timestamptz;

create or replace function public.registra_eliminazione()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.registro_eliminazioni (tabella, id_riga, eliminato_da)
  values (tg_table_name, old.id, auth.uid());
  if tg_table_name = 'preventivi' then
    update public.numeri_assegnati
    set eliminato_il = now()
    where anno = old.anno and numero = old.numero and eliminato_il is null;
  end if;
  return old;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- S1, S6, S7 e strada A nel trigger dei preventivi.
--   INSERT: come la 0004, e in più la revisione 0 non entra su un numero
--     eliminato (S6).
--   UPDATE:
--     - anno, numero e revisione non cambiano (0003);
--     - un annullato non cambia `dati`, `cliente_id`, `totale_imponibile`
--       (0004), e lo stato lo cambia solo un admin (strada A: niente più
--       «riaprire e poi riscrivere» in due UPDATE);
--     - un inviato o accettato non cambia `dati`, `cliente_id`,
--       `totale_imponibile`, se non per mano di un admin («Correggi questo
--       preventivo»). Per gli altri, una nuova revisione. Lo stato, per chi non
--       è admin, va solo avanti: inviato → accettato, inviato → annullato,
--       accettato → annullato. Ogni altro cambio (inviato o accettato → bozza,
--       accettato → inviato, annullato → qualunque) è solo dell'admin: tornare
--       in bozza e poi riscrivere sarebbero due UPDATE, lo stesso aggiramento
--       dell'annullato;
--     - il cliente non cambia se il numero ha altre righe (S7): una revisione
--       tiene il cliente della revisione 0;
--     - `created_by` a NULL solo dall'azione referenziale (S1).
--   L'admin è chi ha `role = 'admin'` nel proprio profilo, che ognuno legge
--   (policy di `profiles`): il trigger resta SECURITY INVOKER. Senza JWT (SQL
--   Editor) `auth.uid()` è NULL, quindi non è admin: un intervento manuale su
--   un preventivo inviato si fa con i claims di un admin, come nel blocco di
--   prova.
-- ───────────────────────────────────────────────────────────────────────────
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
      if exists (
        select 1 from public.numeri_assegnati n
        where n.anno = new.anno and n.numero = new.numero and n.eliminato_il is not null
      ) then
        raise exception 'Un numero di preventivo eliminato non si riusa' using errcode = '23514';
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
    if old.stato in ('inviato', 'accettato', 'annullato')
       and ((new.stato is distinct from old.stato
             and not (old.stato = 'inviato' and new.stato in ('accettato', 'annullato'))
             and not (old.stato = 'accettato' and new.stato = 'annullato'))
            or new.dati is distinct from old.dati
            or new.cliente_id is distinct from old.cliente_id
            or new.totale_imponibile is distinct from old.totale_imponibile)
       and not exists (
         select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
       ) then
      raise exception 'Un preventivo inviato, accettato o annullato lo cambia solo un amministratore: fai una nuova revisione' using errcode = '23514';
    end if;
    if new.cliente_id is distinct from old.cliente_id
       and exists (
         select 1 from public.preventivi p
         where p.anno = new.anno and p.numero = new.numero and p.id <> old.id
       ) then
      raise exception 'Una revisione tiene il cliente del preventivo' using errcode = '23514';
    end if;
    new.created_at := old.created_at;
    if not (new.created_by is null and pg_trigger_depth() > 1) then
      new.created_by := old.created_by;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- S11) L'anno del numero lo sceglie il server.
--
-- `assegna_numero_preventivo(p_anno)` vuole l'anno dal client, che lo legge
-- dall'orologio del browser: un PC con la data sbagliata riceveva 22023. Qui
-- l'anno è quello di Roma letto dal server, e la funzione restituisce anno e
-- numero, perché il client deve scriverli entrambi nella riga del preventivo.
-- SECURITY INVOKER: chiama `assegna_numero_preventivo` con i diritti di chi
-- salva, quindi i controlli (profilo, anno, contatore, numeri assegnati) sono
-- quelli di sempre e nessun privilegio nuovo nasce qui. La funzione di prima
-- resta com'è (contratto della 0004), per i client non ancora aggiornati.
-- ───────────────────────────────────────────────────────────────────────────
create function public.nuovo_numero_preventivo()
returns table (anno int, numero int)
language sql
set search_path = ''
as $$
  select a.anno, public.assegna_numero_preventivo(a.anno)
  from (select extract(year from (now() at time zone 'Europe/Rome'))::int as anno) a;
$$;

revoke all on function public.nuovo_numero_preventivo() from public, anon;
grant execute on function public.nuovo_numero_preventivo() to authenticated;

-- Come nella 0003 e nella 0004: nessuno chiama queste funzioni via RPC.
-- `create or replace` tiene le ACL; le revoche qui le ripetono.
revoke execute on function public.check_email_domain() from public, anon, authenticated;
revoke execute on function public.imposta_audit_clienti() from public, anon, authenticated;
revoke execute on function public.controlla_preventivo() from public, anon, authenticated;
revoke execute on function public.registra_eliminazione() from public, anon, authenticated;

commit;
