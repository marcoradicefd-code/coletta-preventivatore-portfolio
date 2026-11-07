import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { corpoFunzione as corpoIn, leggiMigration, normalizzaSql, policiesDi, ramiTrigger } from '@/test-utils/sqlMigration'

/**
 * Contratto di `0005_correzioni_revisione.sql` (L22, revisione L15-L21 sulla
 * #70): S1, S2, S6, S7, S9, S10 e le due regole della strada A. Come per la
 * 0003 e la 0004 la migration la applica Marco; qui si legge il file e si
 * pretende ciò che promette, con le `raise` asserite insieme alla condizione
 * che le fa scattare. Le regole valide per ogni migration (niente RLS spenta,
 * niente DROP, policy lette tutte) stanno in `schemaMigrazioni.test.ts`.
 */
const NOME = '0005_correzioni_revisione.sql'
const sql = leggiMigration(NOME)
const leggiTesto = (nome: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', nome), 'utf8')
const testoIntero = leggiTesto(NOME)
const corpoFunzione = (nome: string) => corpoIn(sql, nome)

/** Un blocco commentato della testata (`-- <NOME>: INIZIO` … `-- <NOME>: FINE`), con le righe ancora commentate. */
function bloccoInTestata(nome: string): string[] {
  const apertura = `-- ${nome}: INIZIO\n`
  const inizio = testoIntero.indexOf(apertura)
  const fine = testoIntero.indexOf(`-- ${nome}: FINE`)
  if (inizio < 0 || fine < inizio) throw new Error(`blocco ${nome} non trovato`)
  return testoIntero.slice(inizio + apertura.length, fine).split('\n').filter((r) => r !== '')
}

/** `created_by` torna quello di prima, tranne che nell'UPDATE di `on delete set null` (S1). */
const CREATED_BY_S1 =
  'new.created_at := old.created_at; if not (new.created_by is null and pg_trigger_depth() > 1) then new.created_by := old.created_by; end if;'

describe('migration 0005 (correzioni della revisione L15-L21): contratto', () => {
  it('una transazione; prima di tutto BYPASSRLS e la 0004 già applicata', () => {
    expect(sql.trimStart().startsWith('begin;')).toBe(true)
    expect(sql.trimEnd().endsWith('commit;')).toBe(true)
    const primaModifica = sql.search(/create (or replace )?function|create table|alter table|revoke /)
    expect(sql.indexOf('rolbypassrls')).toBeLessThan(primaModifica)
    expect(sql.indexOf("to_regclass('public.numeri_assegnati') is null")).toBeLessThan(primaModifica)
  })

  it('S10. profiles: nessun privilegio ad anon, ad authenticated solo SELECT', () => {
    expect(sql).toContain('revoke all on table public.profiles from anon;')
    expect(sql).toContain('revoke insert, update, delete, truncate, references, trigger on table public.profiles from authenticated;')
    // L'unica grant della 0005 è quella della funzione del numero (S11).
    expect([...sql.matchAll(/grant ([^;]*);/g)].map((m) => m[1])).toEqual(['execute on function public.nuovo_numero_preventivo() to authenticated'])
  })

  it('S11. nuovo_numero_preventivo: anno di Roma dal server, INVOKER, chiama la funzione del numero; EXECUTE solo ad authenticated', () => {
    const f = corpoFunzione('nuovo_numero_preventivo')
    expect(f).toContain('returns table (anno int, numero int) language sql set search_path = \'\'')
    expect(f).not.toContain('security definer')
    expect(f).toContain(
      "select a.anno, public.assegna_numero_preventivo(a.anno) from (select extract(year from (now() at time zone 'europe/rome'))::int as anno) a;"
    )
    expect(sql).toContain('revoke all on function public.nuovo_numero_preventivo() from public, anon;')
  })

  it('S2. check_email_domain: email solo ASCII, dominio in minuscolo "C"; NULL e altri domini restano rifiutati', () => {
    const f = corpoFunzione('check_email_domain')
    expect(f).toContain('security definer')
    expect(f).toContain("set search_path = ''")
    // Dal testo intero: il minuscolo del confronto cancellerebbe la differenza fra A-Z e a-z.
    expect(testoIntero).toContain("     or new.email !~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9.-]+$'\n")
    expect(testoIntero).toContain(
      `     or lower(split_part(new.email, '@', 2) collate "C") not in ('colettaebanisteria.it', 'luxuryacademy.online') then\n`
    )
    expect(f).toMatch(/^.*begin if new\.email is null or new\.email !~ .* then raise exception 'registrazione non consentita per questo dominio email'; end if; return new; end; \$\$;$/)
  })

  it('N4. la regex ASCII accetta l’apostrofo prima della chiocciola; i caratteri non ASCII restano fuori', () => {
    // La regex come la legge Postgres: il letterale SQL con gli apici raddoppiati.
    const letterale = /\n {5}or new\.email !~ '((?:[^']|'')+)'\n/.exec(testoIntero)
    expect(letterale).not.toBeNull()
    const regex = new RegExp(letterale![1].replaceAll("''", "'"))
    expect(regex.test("d'amico.prova@colettaebanisteria.it")).toBe(true)
    expect(regex.test('prova.finta@colettaebanisteria.it')).toBe(true)
    // I caratteri si costruiscono, non si incollano (CLAUDE.md, falsi verdi).
    const iTurca = String.fromCodePoint(0x130)
    const aCirillica = String.fromCodePoint(0x430)
    expect(regex.test(`prova.f${iTurca}nta@colettaebanisteria.it`)).toBe(false)
    expect(regex.test(`prova.finta@colettaeban${iTurca}steria.it`)).toBe(false)
    expect(regex.test(`prova.finta@coletta${aCirillica}ebanisteria.it`)).toBe(false)
    expect(regex.test("d'amico@coletta'ebanisteria.it")).toBe(false)
    expect(regex.test('senza.chiocciola.colettaebanisteria.it')).toBe(false)
  })

  it('S1. clienti: created_by a NULL solo dall’azione referenziale; codice gestionale e updated_by come la 0004', () => {
    const corpo = corpoFunzione('imposta_audit_clienti')
    const { insert, update } = ramiTrigger(corpo)
    expect(insert).toContain('new.created_at := now(); new.created_by := auth.uid();')
    expect(update).toContain(
      "if old.codice_gestionale is not null and new.codice_gestionale is distinct from old.codice_gestionale then raise exception 'il codice gestionale di un cliente non cambia' using errcode = '23514'; end if;"
    )
    expect(update).toContain(CREATED_BY_S1)
    // Nessun `new.created_by := old.created_by` fuori dalla condizione.
    expect(update.split('new.created_by := old.created_by')).toHaveLength(2)
    expect(corpo).toMatch(/end if; new\.updated_at := now\(\); new\.updated_by := auth\.uid\(\); return new; end; \$\$;$/)
    expect(corpo).not.toContain('security definer')
  })

  it('S6. il numero eliminato si segna nel trigger del registro, e la revisione 0 non lo riusa', () => {
    expect(sql).toContain('alter table public.numeri_assegnati add column eliminato_il timestamptz;')
    const r = corpoFunzione('registra_eliminazione')
    expect(r).toContain('security definer')
    expect(r).toContain("set search_path = ''")
    expect(r).toContain(
      'insert into public.registro_eliminazioni (tabella, id_riga, eliminato_da) values (tg_table_name, old.id, auth.uid());'
    )
    expect(r).toContain(
      "if tg_table_name = 'preventivi' then update public.numeri_assegnati set eliminato_il = now() where anno = old.anno and numero = old.numero and eliminato_il is null; end if; return old;"
    )
    const { insert } = ramiTrigger(corpoFunzione('controlla_preventivo'))
    expect(insert).toContain(
      "if new.revisione = 0 then if not exists (select 1 from public.numeri_assegnati n where n.anno = new.anno and n.numero = new.numero and n.assegnato_a = auth.uid()) then raise exception 'numero di preventivo non assegnato a chi salva' using errcode = '23514'; end if; if exists (select 1 from public.numeri_assegnati n where n.anno = new.anno and n.numero = new.numero and n.eliminato_il is not null) then raise exception 'un numero di preventivo eliminato non si riusa' using errcode = '23514'; end if;"
    )
  })

  it('il resto dell’INSERT dei preventivi resta quello della 0004 (contatore, revisione precedente e stesso cliente)', () => {
    const { insert } = ramiTrigger(corpoFunzione('controlla_preventivo'))
    expect(insert).toContain(
      "if not exists (select 1 from public.contatori_preventivi c where c.anno = new.anno and new.numero <= c.ultimo) then raise exception 'numero di preventivo non assegnato' using errcode = '23514'; end if;"
    )
    expect(insert).toContain(
      "elsif not exists (select 1 from public.preventivi p where p.anno = new.anno and p.numero = new.numero and p.revisione = new.revisione - 1) or not exists (select 1 from public.preventivi p where p.anno = new.anno and p.numero = new.numero and p.revisione = 0 and p.cliente_id = new.cliente_id) then raise exception 'revisione senza la precedente, o con un altro cliente' using errcode = '23514'; end if;"
    )
    expect(insert).toContain('new.created_at := now(); new.created_by := auth.uid();')
  })

  it('strada A. inviato, accettato e annullato: dati, cliente, totale solo per l’admin; per gli altri lo stato va solo avanti', () => {
    const { update } = ramiTrigger(corpoFunzione('controlla_preventivo'))
    expect(update).toContain(
      "if new.anno is distinct from old.anno or new.numero is distinct from old.numero or new.revisione is distinct from old.revisione then raise exception 'anno, numero e revisione di un preventivo non cambiano' using errcode = '23514'; end if;"
    )
    expect(update).toContain(
      "if old.stato = 'annullato' and (new.dati is distinct from old.dati or new.cliente_id is distinct from old.cliente_id or new.totale_imponibile is distinct from old.totale_imponibile) then raise exception 'un preventivo annullato non si riscrive' using errcode = '23514'; end if;"
    )
    expect(update).toContain(
      "if old.stato in ('inviato', 'accettato', 'annullato') and ((new.stato is distinct from old.stato and not (old.stato = 'inviato' and new.stato in ('accettato', 'annullato')) and not (old.stato = 'accettato' and new.stato = 'annullato')) or new.dati is distinct from old.dati or new.cliente_id is distinct from old.cliente_id or new.totale_imponibile is distinct from old.totale_imponibile) and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then raise exception 'un preventivo inviato, accettato o annullato lo cambia solo un amministratore: fai una nuova revisione' using errcode = '23514'; end if;"
    )
  })

  it('S7. il cliente di un preventivo con altre revisioni non cambia; S1 anche sui preventivi', () => {
    const corpo = corpoFunzione('controlla_preventivo')
    const { update } = ramiTrigger(corpo)
    expect(update).toContain(
      "if new.cliente_id is distinct from old.cliente_id and exists (select 1 from public.preventivi p where p.anno = new.anno and p.numero = new.numero and p.id <> old.id) then raise exception 'una revisione tiene il cliente del preventivo' using errcode = '23514'; end if;"
    )
    expect(update).toContain(CREATED_BY_S1)
    expect(update.split('new.created_by := old.created_by')).toHaveLength(2)
    // Nessun controllo svuotato (un `where false` lascia la raise scritta ma mai raggiunta).
    for (const f of ['controlla_preventivo', 'imposta_audit_clienti', 'registra_eliminazione', 'check_email_domain', 'nuovo_numero_preventivo']) {
      expect(corpoFunzione(f), f).not.toMatch(/\b(where|and) false\b|\bor true\b|\btrue or\b|\bset \w+ = null\b/)
    }
    expect(corpo).toContain('new.updated_at := now(); new.updated_by := auth.uid(); return new;')
    expect(corpo).not.toContain('security definer')
  })

  it('quattro funzioni cambiate e una nuova, search_path vuoto, DEFINER solo le due di prima, EXECUTE revocato; nessuna policy né tabella', () => {
    const funzioni = [...sql.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map((m) => m[1]).sort()
    expect(funzioni).toEqual(['check_email_domain', 'controlla_preventivo', 'imposta_audit_clienti', 'nuovo_numero_preventivo', 'registra_eliminazione'])
    expect([...sql.matchAll(/create function public\.(\w+)\(/g)].map((m) => m[1])).toEqual(['nuovo_numero_preventivo'])
    expect(funzioni.filter((n) => corpoFunzione(n).includes('security definer'))).toEqual(['check_email_domain', 'registra_eliminazione'])
    for (const n of funzioni) expect(corpoFunzione(n), n).toContain("set search_path = ''")
    for (const n of funzioni.filter((x) => x !== 'nuovo_numero_preventivo')) {
      expect(sql, n).toContain(`revoke execute on function public.${n}() from public, anon, authenticated;`)
    }
    expect(policiesDi(sql)).toEqual([])
    expect(sql).not.toMatch(/create (table|policy|trigger)/)
  })

  it('testata: query di verifica, rollback (S9) e blocco di prova commentato che finisce con ESITO', () => {
    expect(testoIntero).toContain("where table_schema = 'public' and table_name = 'profiles'")
    const rollback = testoIntero.slice(testoIntero.indexOf('-- ROLLBACK'), testoIntero.indexOf('\nbegin;\n'))
    expect(rollback).toContain('alter table public.numeri_assegnati drop column if exists eliminato_il;')
    expect(rollback).toContain('grant all on table public.profiles to anon, authenticated;')
    expect(rollback).toContain('drop function if exists public.nuovo_numero_preventivo();')
    const inizio = testoIntero.indexOf('-- PROVA: INIZIO')
    const fine = testoIntero.indexOf('-- PROVA: FINE')
    expect(inizio).toBeGreaterThan(0)
    expect(fine).toBeGreaterThan(inizio)
    const blocco = testoIntero.slice(inizio, fine)
    expect(blocco).toContain("raise exception 'ESITO: % prove su % come atteso.%'")
    for (const punto of ['S10a', 'S10d', 'S2a', 'S2b', 'S2f', 'S1h', 'S1i', 'S1l', 'S7d', 'S7e', 'A2', 'A4b', 'A4c', 'A4d', 'A5b', 'A6', 'A9', 'A10', 'S6b', 'S6d', 'S11a', 'S11b', 'S11c', 'S11d']) {
      expect(blocco, punto).toContain(`'${punto} `)
    }
    expect(blocco.split('\n').filter((r) => r.trim() && !r.startsWith('--'))).toEqual([])
    // L'esito atteso scritto in testata conta le prove che ci sono davvero.
    const prove = blocco.match(/^-- {5}array\['(?:postgres|user|admin|anon|tmp|senza)', /gm) ?? []
    expect(testoIntero).toContain(`Atteso: «ESITO: ${prove.length} prove su ${prove.length} come atteso.»`)
  })

  it('N3. il rollback si esegue così com’è: le quattro funzioni della 0004 con create or replace, poi funzione nuova, colonna e grant', () => {
    const righe = bloccoInTestata('ROLLBACK')
    expect(righe.filter((r) => !r.startsWith('--'))).toEqual([])
    const r = normalizzaSql(righe.map((x) => x.replace(/^-- ?/, '')).join('\n')).trim()
    // Una `create function` di una funzione che c'è già fallisce («already exists») e ferma il rollback a metà.
    expect(r).not.toMatch(/create function/)
    expect(r.startsWith('begin;')).toBe(true)
    expect(r.endsWith('commit;')).toBe(true)
    const sql4 = leggiMigration('0004_fondamenta_dati_veri.sql')
    for (const n of ['check_email_domain', 'imposta_audit_clienti', 'controlla_preventivo', 'registra_eliminazione']) {
      expect(corpoIn(r, n), n).toBe(corpoIn(sql4, n).replace(/^create function/, 'create or replace function'))
    }
    const coda =
      'drop function if exists public.nuovo_numero_preventivo(); alter table public.numeri_assegnati drop column if exists eliminato_il; grant all on table public.profiles to anon, authenticated; commit;'
    // Le funzioni tornano alla 0004 PRIMA della drop della colonna, che i corpi della 0005 usano.
    expect(r.endsWith(`$$; ${coda}`)).toBe(true)
  })

  it('S9. i rollback della 0003 e della 0004 dicono di togliere prima le migration dopo', () => {
    const r3 = leggiTesto('0003_clienti_preventivi.sql')
    const rollback3 = r3.slice(r3.indexOf('-- ROLLBACK'), r3.indexOf('--      begin;', r3.indexOf('-- ROLLBACK')))
    expect(rollback3).toContain('PRIMA i loro rollback, dall')
    expect(rollback3).toContain('(0006, poi 0005, poi 0004')
    const r4 = leggiTesto('0004_fondamenta_dati_veri.sql')
    const rollback4 = r4.slice(r4.indexOf('-- ROLLBACK'), r4.indexOf('--      begin;', r4.indexOf('-- ROLLBACK')))
    expect(rollback4).toContain('Se la 0005 è applicata, PRIMA il suo rollback')
  })
})
