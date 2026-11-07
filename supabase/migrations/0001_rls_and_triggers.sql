-- ============================================================================
-- 0001_rls_and_triggers.sql
--
-- SCHEMA INIZIALE, NON lo specchio della produzione (stato al 07/10/2026).
-- La prod è andata avanti: con la 0002 (revoca di EXECUTE sulle funzioni
-- SECURITY DEFINER) e con modifiche fatte a mano dal pannello Supabase.
-- Differenze note: corpi di `handle_new_user` e `check_email_domain`, colonne
-- `email`/`created_at` di `profiles`, `role` nullable (vedi
-- `.claude/rules/auth-supabase.md`, «Debito noto»).
-- NON va riapplicata all'ambiente esistente. La rigenerazione dal DB live è
-- una PR IaC a registro in `docs/overview.md` § Orizzonte.
--
-- Idempotente: pensato per ricreare l'ambiente da zero senza errori se
-- rieseguito (CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF
-- EXISTS prima di CREATE POLICY|TRIGGER).
--
-- NOTA DI VERIFICA: la descrizione delle policy admin sullo storage indicava
-- solo la condizione "EXISTS su profiles ... role='admin'". Qui le policy sono
-- scopate anche a `bucket_id = 'Listini'` (forma sicura e coerente col nome
-- delle policy). Se la policy LIVE NON contiene il filtro su bucket_id,
-- allineare questo file all'output reale di `select ... from pg_policies`.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- Tabella profiles (un profilo per utente; il ruolo gate-a Gestione Listini)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user'))
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- ───────────────────────────────────────────────────────────────────────────
-- Funzioni (SECURITY DEFINER, search_path bloccato a public, auth)
-- ───────────────────────────────────────────────────────────────────────────

-- Crea il profilo (role 'user') alla registrazione di un nuovo utente auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Rigetta la registrazione se il dominio email non è whitelisted.
create or replace function public.check_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if split_part(new.email, '@', 2) not in (
    'colettaebanisteria.it',
    'luxuryacademy.online'
  ) then
    raise exception 'Registrazione non consentita per il dominio: %',
      split_part(new.email, '@', 2);
  end if;
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Trigger su auth.users
--   - enforce_email_domain (BEFORE INSERT): blocca i domini non ammessi
--   - on_auth_user_created (AFTER INSERT):  crea il profilo
-- ───────────────────────────────────────────────────────────────────────────
drop trigger if exists enforce_email_domain on auth.users;
create trigger enforce_email_domain
  before insert on auth.users
  for each row
  execute function public.check_email_domain();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- Storage: bucket privato "Listini" (case-sensitive, L maiuscola)
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('Listini', 'Listini', false)
on conflict (id) do nothing;

-- Config del bucket rispecchiata: MIME ammessi + limite dimensione (31/07/2026).
--
-- `application/json` NON è decorazione: è il SIDECAR della selezione fogli
-- (#22 — `<nomefile>.meta.json`, caricato da `GestioneListini.tsx` con
-- `contentType: 'application/json'`). Con l'allowlist ai soli MIME Excel,
-- Storage rifiuta l'upload del sidecar con `mime type application/json is not
-- supported`, e la selezione fogli non si può salvare. Scoperto al primo
-- upload reale con selezione fogli e corretto in produzione il 31/07/2026;
-- questa riga allinea l'IaC allo stato live.
--
-- Perché un UPDATE e non le colonne nell'INSERT qui sopra: quell'INSERT ha
-- `on conflict (id) do nothing`, quindi su un bucket che ESISTE GIÀ — la
-- produzione, e ogni riesecuzione di questo file — non toccherebbe niente.
-- L'UPDATE riallinea in entrambi i casi ed è idempotente per costruzione:
-- riscrive gli stessi valori.
--
-- `file_size_limit` sta nello stesso UPDATE, non in uno adiacente: è la stessa
-- riga di `storage.buckets`, scritta per lo stesso motivo. 10485760 byte =
-- 10 MiB, il valore live; senza questa colonna una ricostruzione da zero
-- prenderebbe il default di progetto — un altro limite, in silenzio, scoperto
-- solo dal primo listino che non passa.
update storage.buckets
set allowed_mime_types = array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/json'
],
    file_size_limit = 10485760
where id = 'Listini';

alter table storage.objects enable row level security;

-- SELECT: ogni utente autenticato può leggere/scaricare i listini.
drop policy if exists "Authenticated can read listini" on storage.objects;
create policy "Authenticated can read listini"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'Listini');

-- INSERT: solo admin possono caricare.
drop policy if exists "Admins can upload listini" on storage.objects;
create policy "Admins can upload listini"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'Listini'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- UPDATE: solo admin possono sovrascrivere.
drop policy if exists "Admins can update listini" on storage.objects;
create policy "Admins can update listini"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'Listini'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    bucket_id = 'Listini'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- DELETE: solo admin possono eliminare.
drop policy if exists "Admins can delete listini" on storage.objects;
create policy "Admins can delete listini"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'Listini'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
