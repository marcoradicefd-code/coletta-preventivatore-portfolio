-- ============================================================================
-- 0006_import_anagrafica.sql
--
-- Data: 2026-10-14 (L21, PR C, issue #70). L'import dell'anagrafica è solo
-- dell'amministratore: lo dice l'app (pagina «Importa anagrafica» solo per
-- l'admin) e qui lo ripete il database.
--
-- Scritta e NON applicata da Claude Code. La applica Marco dal SQL Editor:
-- prima su coletta-dev (con il blocco di prova qui sotto), poi sulla
-- produzione, PRIMA del merge e PRIMA dell'import (backup della produzione
-- prima, Database › Backups). Parte dalla 0005.
--
-- Cosa fa: il `codice_gestionale` lo scrive solo l'import, quindi scriverlo è
-- solo dell'admin. Nel trigger di audit dei clienti (`imposta_audit_clienti`,
-- SECURITY INVOKER, come nella 0005):
--   - INSERT con un codice gestionale: solo l'admin (42501);
--   - UPDATE che dà il codice a un cliente che non l'aveva («Collega»
--     dell'import): solo l'admin (42501);
--   - il resto non cambia: un codice scritto non cambia più (0004 c, 23514),
--     `created_*`/`updated_*` dal trigger, `created_by` a NULL solo
--     dall'azione referenziale (0005, S1).
-- Senza codice tutto resta com'era: chi ha un profilo crea e modifica i
-- clienti (residuo voluto della PR A, guida di sicurezza). Gli altri campi di
-- un cliente col codice li modifica chi ha un profilo, come oggi.
--
-- L'admin è chi ha `role = 'admin'` nel proprio profilo, che ognuno legge
-- (policy di `profiles`), come nel trigger dei preventivi della 0005. Senza JWT
-- (SQL Editor) `auth.uid()` è NULL, quindi nessuno è admin: un codice scritto
-- a mano dal SQL Editor è rifiutato (42501), come l'UPDATE di un preventivo
-- inviato (O4 nella rule `auth-supabase`). L'import si fa dall'app.
--
-- Nessuna tabella, policy, indice o funzione nuova: l'unicità del codice c'è
-- dalla 0003 (`codice_gestionale text unique`, con il suo indice), e un
-- rilancio dell'import non duplica (23505). Una sola transazione, con le
-- precondizioni (BYPASSRLS, 0005 applicata). La funzione cambia con
-- `create or replace`, che tiene proprietario e ACL; la revoca la ripete.
--
-- ────────────────────────────────────────────────────────────────────────────
-- COME VERIFICARLA (dopo l'applicazione, dal SQL Editor; incollare l'esito)
-- ────────────────────────────────────────────────────────────────────────────
-- 1) La funzione (atteso: una riga, prosecdef = f, proconfig =
--    {search_path=""}, anon = f, authenticated = f, controllo = t):
--      select p.proname, p.prosecdef, p.proconfig,
--             has_function_privilege('anon', p.oid, 'execute') as anon,
--             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--             position('import dell''''amministratore' in p.prosrc) > 0 as controllo
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and p.proname = 'imposta_audit_clienti';
--
-- 2) Il trigger è quello di prima (atteso: una riga, clienti_audit, BEFORE
--    INSERT OR UPDATE, abilitato = O):
--      select tgname, tgenabled, tgfoid::regprocedure as funzione
--      from pg_trigger
--      where tgrelid = 'public.clienti'::regclass and tgname = 'clienti_audit';
--
-- 3) Il blocco di prova, SOLO su coletta-dev: tutto il file fra «PROVA: INIZIO»
--    e «PROVA: FINE» qui sotto, tolti i `--` iniziali. Usa un profilo `user` e
--    un profilo `admin` che esistono già (li cerca da sé), JWT simulati e solo
--    dati finti (codici `PROVA-0006-…`, «Cliente Prova», telefoni di zeri).
--    Finisce SEMPRE con un errore voluto, `ESITO: …`: l'errore annulla l'intera
--    transazione, quindi non resta niente (né clienti, né righe del registro).
--    Atteso: «ESITO: 13 prove su 13 come atteso.»; altrimenti l'elenco delle
--    prove KO con il codice ottenuto.
--
-- PROVA: INIZIO
-- do $prova$
-- declare
--   v_user uuid;
--   v_admin uuid;
--   v_senza uuid := gen_random_uuid();
--   c1 uuid := gen_random_uuid();
--   c2 uuid := gen_random_uuid();
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
--   prove := array[
--     array['user', 'I1 lo user crea un cliente col codice', 'insert into public.clienti (ragione_sociale, codice_gestionale) values (''Cliente Prova Uno'', ''PROVA-0006-U'')', '42501'],
--     array['user', 'I2 lo user crea un cliente senza codice (ammesso)', format('with x as (insert into public.clienti (id, ragione_sociale, telefono) values (%L, ''Cliente Prova Due'', ''000 0000001'') returning 1) select count(*) from x', c1), '=1'],
--     array['user', 'I3 lo user dà il codice a chi non l''aveva', format('update public.clienti set codice_gestionale = ''PROVA-0006-U'' where id = %L', c1), '42501'],
--     array['admin', 'I4 l''admin importa un cliente col codice', format('with x as (insert into public.clienti (id, ragione_sociale, codice_gestionale) values (%L, ''Cliente Prova Tre'', ''PROVA-0006-A'') returning 1) select count(*) from x', c2), '=1'],
--     array['admin', 'I5 l''admin collega: il codice a chi non l''aveva', format('with x as (update public.clienti set codice_gestionale = ''PROVA-0006-B'', localita = ''Paese di Prova'' where id = %L and codice_gestionale is null returning 1) select count(*) from x', c1), '=1'],
--     array['admin', 'I6 l''admin cambia un codice scritto', format('update public.clienti set codice_gestionale = ''PROVA-0006-C'' where id = %L', c2), '23514'],
--     array['user', 'I7 lo user modifica un cliente col codice (ammesso, come oggi)', format('with x as (update public.clienti set telefono = ''000 0000002'' where id = %L returning 1) select count(*) from x', c2), '=1'],
--     array['user', 'I8 lo user toglie il codice', format('update public.clienti set codice_gestionale = null where id = %L', c1), '23514'],
--     array['admin', 'I9 il rilancio non duplica: codice già usato', 'insert into public.clienti (ragione_sociale, codice_gestionale) values (''Cliente Prova Tre'', ''PROVA-0006-A'')', '23505'],
--     array['postgres', 'I10 dal SQL Editor, senza JWT, il codice non entra', 'insert into public.clienti (ragione_sociale, codice_gestionale) values (''Cliente Prova Quattro'', ''PROVA-0006-D'')', '42501'],
--     array['senza', 'I11 senza profilo non crea clienti', 'insert into public.clienti (ragione_sociale) values (''Cliente Prova Cinque'')', '42501'],
--     array['anon', 'I12 anon non crea clienti', 'insert into public.clienti (ragione_sociale) values (''Cliente Prova Sei'')', '42501'],
--     array['postgres', 'I13 created_by dell''admin, updated_by dello user', format('select count(*) from public.clienti where id = %L and created_by = %L and updated_by = %L', c2, v_admin, v_user), '=1']
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
--         ko := ko + 1; esiti := esiti || format('%s: accettata invece di %s', prove[i][2], atteso);
--       end if;
--     exception when others then
--       if sqlstate = atteso then ok := ok + 1;
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
-- ROLLBACK (togliere la 0006 senza toccare la 0005; nessun dato si perde)
-- ────────────────────────────────────────────────────────────────────────────
-- Tutto il testo fra «ROLLBACK: INIZIO» e «ROLLBACK: FINE», tolti i `--`
-- iniziali, si esegue così com'è dal SQL Editor: il corpo della 0005, con
-- `create or replace` (proprietario e ACL restano). I codici già scritti
-- restano: il rollback toglie solo il controllo dell'admin.
--
-- ROLLBACK: INIZIO
-- begin;
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
--     if old.codice_gestionale is not null
--        and new.codice_gestionale is distinct from old.codice_gestionale then
--       raise exception 'Il codice gestionale di un cliente non cambia' using errcode = '23514';
--     end if;
--     new.created_at := old.created_at;
--     if not (new.created_by is null and pg_trigger_depth() > 1) then
--       new.created_by := old.created_by;
--     end if;
--   end if;
--   new.updated_at := now();
--   new.updated_by := auth.uid();
--   return new;
-- end;
-- $$;
--
-- commit;
-- ROLLBACK: FINE
-- ============================================================================

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Precondizioni: chi applica è `postgres` (come la 0003-0005), e la 0005 è
--    già applicata (il corpo qui sotto parte dal suo).
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_roles
    where rolname = current_user and (rolbypassrls or rolsuper)
  ) then
    raise exception 'Il ruolo % non ha BYPASSRLS: applicare come postgres.', current_user;
  end if;
  if to_regprocedure('public.nuovo_numero_preventivo()') is null then
    raise exception 'La 0005 non è applicata: applicarla prima della 0006.';
  end if;
end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Il codice gestionale lo scrive solo l'admin.
--
-- È la chiave dell'import: un cliente col codice è arrivato dal gestionale,
-- e «Collega» (un cliente creato a mano che l'import ritrova) è dare il codice
-- a chi non l'aveva. Tutte e due le cose sono dell'import, quindi dell'admin.
-- Il blocco della 0004 (scritto, non cambia più) resta, prima del controllo
-- nuovo: un codice cambiato è 23514 per tutti, admin compreso.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.imposta_audit_clienti()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.codice_gestionale is not null
       and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
      raise exception 'Il codice gestionale lo scrive solo l''import dell''amministratore' using errcode = '42501';
    end if;
    new.created_at := now();
    new.created_by := auth.uid();
  else
    if old.codice_gestionale is not null
       and new.codice_gestionale is distinct from old.codice_gestionale then
      raise exception 'Il codice gestionale di un cliente non cambia' using errcode = '23514';
    end if;
    if old.codice_gestionale is null and new.codice_gestionale is not null
       and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
      raise exception 'Il codice gestionale lo scrive solo l''import dell''amministratore' using errcode = '42501';
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

-- Come nella 0003-0005: nessuno la chiama via RPC. EXECUTE si controlla solo a
-- CREATE TRIGGER (0002), quindi il trigger gira.
revoke execute on function public.imposta_audit_clienti() from public, anon, authenticated;

commit;
