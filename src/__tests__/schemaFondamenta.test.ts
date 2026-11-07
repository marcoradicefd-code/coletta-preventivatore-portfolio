import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { corpoFunzione as corpoIn, leggiMigration, policiesDi, ramiTrigger } from '@/test-utils/sqlMigration'

/**
 * Contratto di `0004_fondamenta_dati_veri.sql` (L21, PR B): le condizioni del
 * verdetto sulla #96 prima dei dati veri. Come per la 0003, la migration la
 * applica Marco; qui si legge il file e si pretende ciò che promette, con le
 * `raise` asserite insieme alla condizione che le fa scattare e il corpo delle
 * policy parola per parola. Le mutazioni che questi test devono far diventare
 * rosse sono elencate nel body della PR, con l'esito.
 */
const sql = leggiMigration('0004_fondamenta_dati_veri.sql')
const testoIntero = readFileSync(resolve(process.cwd(), 'supabase/migrations/0004_fondamenta_dati_veri.sql'), 'utf8')
const policies = policiesDi(sql)
const corpoFunzione = (nome: string) => corpoIn(sql, nome)

const PROFILO = '(select 1 from public.profiles p where p.id = (select auth.uid()))'

describe('migration 0004 (fondamenta dei dati veri): contratto', () => {
  it('una transazione; prima di tutto BYPASSRLS e la 0003 già applicata', () => {
    expect(sql.trimStart().startsWith('begin;')).toBe(true)
    expect(sql.trimEnd().endsWith('commit;')).toBe(true)
    const primaModifica = sql.search(/create (or replace )?function|create table|alter table/)
    expect(sql.indexOf('rolbypassrls')).toBeLessThan(primaModifica)
    expect(sql.indexOf("to_regclass('public.preventivi') is null")).toBeLessThan(primaModifica)
  })

  it('a. check_email_domain: NULL, vuota, due chiocciole e altri domini rifiutati, dominio in minuscolo', () => {
    const f = corpoFunzione('check_email_domain')
    expect(f).toContain('security definer')
    expect(f).toContain("set search_path = ''")
    expect(f).toContain(
      "if new.email is null or new.email !~ '^[^@[:space:]]+@[^@[:space:]]+$' or lower(split_part(new.email, '@', 2)) not in ('colettaebanisteria.it', 'luxuryacademy.online') then raise exception"
    )
    expect(sql).toContain('revoke execute on function public.check_email_domain() from public, anon, authenticated;')
    expect(sql).not.toMatch(/grant [^;]*check_email_domain/)
  })

  it('b. e c. clienti: updated_by dal trigger, codice gestionale immutabile una volta scritto (raise asserita)', () => {
    expect(sql).toContain('alter table public.clienti add column updated_by uuid references auth.users (id) on delete set null;')
    const corpo = corpoFunzione('imposta_audit_clienti')
    const { insert, update } = ramiTrigger(corpo)
    expect(insert).toContain('new.created_at := now(); new.created_by := auth.uid();')
    expect(update).toContain(
      "if old.codice_gestionale is not null and new.codice_gestionale is distinct from old.codice_gestionale then raise exception 'il codice gestionale di un cliente non cambia' using errcode = '23514'; end if;"
    )
    expect(update).toContain('new.created_at := old.created_at; new.created_by := old.created_by;')
    expect(corpo).toMatch(/end if; new\.updated_at := now\(\); new\.updated_by := auth\.uid\(\); return new; end; \$\$;$/)
  })

  it('d. ed e. trigger dei preventivi: contatore, numero assegnato a chi salva, revisione precedente e stesso cliente', () => {
    const { insert } = ramiTrigger(corpoFunzione('controlla_preventivo'))
    expect(insert).toContain(
      "if not exists (select 1 from public.contatori_preventivi c where c.anno = new.anno and new.numero <= c.ultimo) then raise exception 'numero di preventivo non assegnato' using errcode = '23514'; end if;"
    )
    expect(insert).toContain(
      "if new.revisione = 0 then if not exists (select 1 from public.numeri_assegnati n where n.anno = new.anno and n.numero = new.numero and n.assegnato_a = auth.uid()) then raise exception 'numero di preventivo non assegnato a chi salva' using errcode = '23514'; end if;"
    )
    expect(insert).toContain(
      "elsif not exists (select 1 from public.preventivi p where p.anno = new.anno and p.numero = new.numero and p.revisione = new.revisione - 1) or not exists (select 1 from public.preventivi p where p.anno = new.anno and p.numero = new.numero and p.revisione = 0 and p.cliente_id = new.cliente_id) then raise exception 'revisione senza la precedente, o con un altro cliente' using errcode = '23514'; end if;"
    )
    expect(insert).toContain('new.created_at := now(); new.created_by := auth.uid();')
  })

  it('d. un annullato non si riscrive; anno, numero e revisione restano immutabili (raise asserite)', () => {
    const corpo = corpoFunzione('controlla_preventivo')
    const { update } = ramiTrigger(corpo)
    expect(update).toContain(
      "if new.anno is distinct from old.anno or new.numero is distinct from old.numero or new.revisione is distinct from old.revisione then raise exception 'anno, numero e revisione di un preventivo non cambiano' using errcode = '23514'; end if;"
    )
    expect(update).toContain(
      "if old.stato = 'annullato' and (new.dati is distinct from old.dati or new.cliente_id is distinct from old.cliente_id or new.totale_imponibile is distinct from old.totale_imponibile) then raise exception 'un preventivo annullato non si riscrive' using errcode = '23514'; end if;"
    )
    expect(update).toContain('new.created_at := old.created_at; new.created_by := old.created_by;')
    expect(corpo).toContain('new.updated_at := now(); new.updated_by := auth.uid(); return new;')
    expect(corpo).not.toContain('security definer')
  })

  it('e. numeri_assegnati: RLS enable e force, lettura solo dei propri, nessuna scrittura per anon né authenticated', () => {
    expect(sql).toContain('create table public.numeri_assegnati (anno int not null')
    expect(sql).toContain('primary key (anno, numero)')
    expect(sql).toContain('alter table public.numeri_assegnati enable row level security;')
    expect(sql).toContain('alter table public.numeri_assegnati force row level security;')
    const p = policies.filter((x) => x.tabella === 'numeri_assegnati')
    expect(p.map((x) => x.comando)).toEqual(['select'])
    expect(p[0].corpo.trim()).toBe(`using (assegnato_a = (select auth.uid()) and exists ${PROFILO})`)
    expect(sql).toContain('revoke all on table public.numeri_assegnati from anon;')
    expect(sql).toContain('revoke insert, update, delete, truncate, references, trigger on table public.numeri_assegnati from authenticated;')
  })

  it('f. il numero: anno del server, il precedente solo a gennaio, il successivo mai; scritto con chi lo chiede', () => {
    const f = corpoFunzione('assegna_numero_preventivo')
    expect(f).toContain('security definer')
    expect(f).toContain("set search_path = ''")
    expect(f).toContain("v_oggi date := (now() at time zone 'europe/rome')::date; v_anno_server int := extract(year from v_oggi)::int;")
    expect(f).toMatch(/if auth\.uid\(\) is null or not exists \(select 1 from public\.profiles p where p\.id = auth\.uid\(\)\) then raise exception 'operazione non consentita' using errcode = '42501'/)
    expect(f).toContain(
      "if p_anno is null or not (p_anno = v_anno_server or (p_anno = v_anno_server - 1 and extract(month from v_oggi) = 1)) then raise exception 'anno del preventivo non valido' using errcode = '22023'; end if;"
    )
    const contatore = f.indexOf(
      'insert into public.contatori_preventivi as c (anno, ultimo) values (p_anno, 1) on conflict (anno) do update set ultimo = c.ultimo + 1 returning c.ultimo into v_numero;'
    )
    const assegnato = f.indexOf(
      'insert into public.numeri_assegnati (anno, numero, assegnato_a, assegnato_il) values (p_anno, v_numero, auth.uid(), now());'
    )
    expect(contatore).toBeGreaterThan(0)
    expect(assegnato).toBeGreaterThan(contatore)
    expect(sql).toContain('revoke all on function public.assegna_numero_preventivo(int) from public, anon;')
  })

  it('g. registro delle eliminazioni: solo identificativi, scritto dal trigger AFTER DELETE, letto solo dall’admin', () => {
    const tabella = /create table public\.registro_eliminazioni \((.*?)\);/.exec(sql)?.[1] ?? ''
    const colonne = tabella.split(/,(?![^(]*\))/).map((c) => c.trim().split(' ')[0])
    expect(colonne).toEqual(['id', 'tabella', 'id_riga', 'eliminato_da', 'eliminato_il'])
    expect(sql).toContain('alter table public.registro_eliminazioni enable row level security;')
    expect(sql).toContain('alter table public.registro_eliminazioni force row level security;')
    const p = policies.filter((x) => x.tabella === 'registro_eliminazioni')
    expect(p.map((x) => x.comando)).toEqual(['select'])
    expect(p[0].corpo.trim()).toBe(
      "using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))"
    )
    expect(sql).toContain('revoke all on table public.registro_eliminazioni from anon;')
    expect(sql).toContain(
      'revoke insert, update, delete, truncate, references, trigger on table public.registro_eliminazioni from authenticated;'
    )
    const f = corpoFunzione('registra_eliminazione')
    expect(f).toContain('security definer')
    expect(f).toContain("set search_path = ''")
    expect(f).toContain(
      'insert into public.registro_eliminazioni (tabella, id_riga, eliminato_da) values (tg_table_name, old.id, auth.uid());'
    )
    expect(f).not.toMatch(/old\.(?!id\b)\w+/)
    for (const t of ['clienti', 'preventivi']) {
      expect(sql).toContain(
        `create trigger ${t}_registro_eliminazioni after delete on public.${t} for each row execute function public.registra_eliminazione();`
      )
    }
  })

  it('nessuna policy, grant o privilegio per anon (lista dei ruoli letta intera); policy solo SELECT', () => {
    expect(policies).toHaveLength(2)
    for (const p of policies) {
      expect(p.ruoli, p.nome).toEqual(['authenticated'])
      expect(p.comando, p.nome).toBe('select')
    }
    expect(sql).not.toMatch(/to [^;]*\banon\b/)
    const grant = [...sql.matchAll(/grant ([^;]*);/g)].map((m) => m[1])
    expect(grant).toEqual(['execute on function public.assegna_numero_preventivo(int) to authenticated'])
  })

  it('ogni funzione ha search_path vuoto; SECURITY DEFINER solo le tre che scrivono ciò che l’utente non può; EXECUTE revocato ai trigger', () => {
    const funzioni = [...sql.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map((m) => m[1]).sort()
    expect(funzioni).toEqual([
      'assegna_numero_preventivo',
      'check_email_domain',
      'controlla_preventivo',
      'imposta_audit_clienti',
      'registra_eliminazione',
    ])
    const definer = funzioni.filter((n) => corpoFunzione(n).includes('security definer'))
    expect(definer).toEqual(['assegna_numero_preventivo', 'check_email_domain', 'registra_eliminazione'])
    for (const n of funzioni) expect(corpoFunzione(n), n).toContain("set search_path = ''")
    for (const n of ['registra_eliminazione', 'imposta_audit_clienti', 'controlla_preventivo', 'check_email_domain']) {
      expect(sql, n).toContain(`revoke execute on function public.${n}() from public, anon, authenticated;`)
    }
  })

  it('h. la testata ha le query di verifica (anche le policy di profiles) e il blocco di prova che si annulla da sé', () => {
    expect(testoIntero).toContain("where schemaname = 'public' and tablename = 'profiles';")
    const inizio = testoIntero.indexOf('-- PROVA: INIZIO')
    const fine = testoIntero.indexOf('-- PROVA: FINE')
    expect(inizio).toBeGreaterThan(0)
    expect(fine).toBeGreaterThan(inizio)
    const blocco = testoIntero.slice(inizio, fine)
    expect(blocco).toContain("raise exception 'ESITO: % prove su % come atteso.%'")
    for (const punto of ['A1', 'B1', 'C1', 'D2', 'E5', 'E10', 'E11', 'F1', 'G5', 'N1', 'X1']) {
      expect(blocco, punto).toContain(`'${punto} `)
    }
    // Tutto commentato: il blocco non gira mai con l'applicazione della migration.
    expect(blocco.split('\n').filter((r) => r.trim() && !r.startsWith('--'))).toEqual([])
  })
})
