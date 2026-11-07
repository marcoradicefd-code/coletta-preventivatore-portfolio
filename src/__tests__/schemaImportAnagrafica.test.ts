import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { corpoFunzione as corpoIn, leggiMigration, normalizzaSql, policiesDi, ramiTrigger } from '@/test-utils/sqlMigration'

/**
 * Contratto di `0006_import_anagrafica.sql` (L21, PR C): l'import è solo
 * dell'admin, e lo ripete il database. Il codice gestionale lo scrive solo
 * l'import, quindi scriverlo (un cliente nuovo con il codice, o «Collega», che
 * lo dà a chi non l'aveva) è solo dell'admin; il resto della 0005 non cambia.
 * Come per le altre, la migration la applica Marco; qui si legge il file.
 */
const NOME = '0006_import_anagrafica.sql'
const leggiTesto = (nome: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', nome), 'utf8')
const sql = leggiMigration(NOME)
const testoIntero = leggiTesto(NOME)
const corpo = corpoIn(sql, 'imposta_audit_clienti')

const NON_ADMIN = "not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')"
const RAISE_ADMIN = "raise exception 'il codice gestionale lo scrive solo l''import dell''amministratore' using errcode = '42501';"

/** Un blocco commentato della testata (`-- <NOME>: INIZIO` … `-- <NOME>: FINE`), righe ancora commentate. */
function bloccoInTestata(nome: string): string[] {
  const apertura = `-- ${nome}: INIZIO\n`
  const inizio = testoIntero.indexOf(apertura)
  const fine = testoIntero.indexOf(`-- ${nome}: FINE`)
  if (inizio < 0 || fine < inizio) throw new Error(`blocco ${nome} non trovato`)
  return testoIntero.slice(inizio + apertura.length, fine).split('\n').filter((r) => r !== '')
}

describe('migration 0006 (import dell’anagrafica): contratto', () => {
  it('una transazione; prima di tutto BYPASSRLS e la 0005 già applicata', () => {
    expect(sql.trimStart().startsWith('begin;')).toBe(true)
    expect(sql.trimEnd().endsWith('commit;')).toBe(true)
    const primaModifica = sql.search(/create (or replace )?function|create table|alter table|revoke /)
    expect(sql.indexOf('rolbypassrls')).toBeLessThan(primaModifica)
    expect(sql.indexOf("to_regprocedure('public.nuovo_numero_preventivo()') is null")).toBeLessThan(primaModifica)
  })

  it('INSERT con il codice gestionale: solo l’admin (42501), raise asserita con la sua condizione', () => {
    const { insert } = ramiTrigger(corpo)
    expect(insert).toContain(`if new.codice_gestionale is not null and ${NON_ADMIN} then ${RAISE_ADMIN} end if;`)
    expect(insert).toContain('new.created_at := now(); new.created_by := auth.uid();')
  })

  it('UPDATE: il codice dato a chi non l’aveva («Collega») solo dall’admin; scritto, non cambia (0004 c)', () => {
    const { update } = ramiTrigger(corpo)
    expect(update).toContain(
      "if old.codice_gestionale is not null and new.codice_gestionale is distinct from old.codice_gestionale then raise exception 'il codice gestionale di un cliente non cambia' using errcode = '23514'; end if;"
    )
    expect(update).toContain(`if old.codice_gestionale is null and new.codice_gestionale is not null and ${NON_ADMIN} then ${RAISE_ADMIN} end if;`)
  })

  it('il resto è la 0005: audit dal trigger, created_by a NULL solo dall’azione referenziale (S1), INVOKER', () => {
    const { update } = ramiTrigger(corpo)
    expect(update).toContain(
      'new.created_at := old.created_at; if not (new.created_by is null and pg_trigger_depth() > 1) then new.created_by := old.created_by; end if;'
    )
    expect(corpo).toMatch(/end if; new\.updated_at := now\(\); new\.updated_by := auth\.uid\(\); return new; end; \$\$;$/)
    expect(corpo).toContain("set search_path = ''")
    expect(corpo).not.toContain('security definer')
    expect(corpo).not.toMatch(/\b(where|and) false\b|\bor true\b|\btrue or\b/)
    // Tolte le due righe nuove, il corpo è quello della 0005, parola per parola.
    const senzaControlli = corpo
      .replace(` if new.codice_gestionale is not null and ${NON_ADMIN} then ${RAISE_ADMIN} end if;`, '')
      .replace(` if old.codice_gestionale is null and new.codice_gestionale is not null and ${NON_ADMIN} then ${RAISE_ADMIN} end if;`, '')
    expect(senzaControlli).toBe(corpoIn(leggiMigration('0005_correzioni_revisione.sql'), 'imposta_audit_clienti'))
  })

  it('una sola funzione cambiata, EXECUTE revocato; nessuna tabella, policy, trigger né grant', () => {
    expect([...sql.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map((m) => m[1])).toEqual(['imposta_audit_clienti'])
    expect(sql).not.toMatch(/create function/)
    expect(sql).toContain('revoke execute on function public.imposta_audit_clienti() from public, anon, authenticated;')
    expect(policiesDi(sql)).toEqual([])
    expect(sql).not.toMatch(/create (table|policy|trigger)|\bgrant /)
  })

  it('testata: query di verifica e blocco di prova commentato che finisce con ESITO, con le prove dell’import', () => {
    expect(testoIntero).toContain("and p.proname = 'imposta_audit_clienti'")
    const blocco = bloccoInTestata('PROVA')
    expect(blocco.filter((r) => !r.startsWith('--'))).toEqual([])
    const testo = blocco.join('\n')
    expect(testo).toContain("raise exception 'ESITO: % prove su % come atteso.%'")
    for (const punto of ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10', 'I11', 'I12']) {
      expect(testo, punto).toContain(`'${punto} `)
    }
    const prove = testo.match(/^-- {5}array\['(?:postgres|user|admin|anon|senza)', /gm) ?? []
    expect(testoIntero).toContain(`Atteso: «ESITO: ${prove.length} prove su ${prove.length} come atteso.»`)
  })

  it('il rollback si esegue così com’è e riporta il corpo della 0005, con create or replace', () => {
    const righe = bloccoInTestata('ROLLBACK')
    expect(righe.filter((r) => !r.startsWith('--'))).toEqual([])
    const r = normalizzaSql(righe.map((x) => x.replace(/^-- ?/, '')).join('\n')).trim()
    expect(r).not.toMatch(/create function/)
    expect(r.startsWith('begin;')).toBe(true)
    expect(r.endsWith('$$; commit;')).toBe(true)
    expect(corpoIn(r, 'imposta_audit_clienti')).toBe(corpoIn(leggiMigration('0005_correzioni_revisione.sql'), 'imposta_audit_clienti'))
  })

  it('DB-3 (verdetto del 15/10). la testata della 0004 dice, prima del suo blocco di prova, che dopo la 0006 non si riesegue', () => {
    const t4 = leggiTesto('0004_fondamenta_dati_veri.sql')
    const riga = t4.indexOf('--    Dopo la 0006 questo blocco non si riesegue più')
    expect(riga).toBeGreaterThan(0)
    expect(riga).toBeLessThan(t4.indexOf('-- PROVA: INIZIO'))
    // Solo un commento: il blocco di prova e lo SQL eseguibile della 0004 non cambiano.
    expect(leggiMigration('0004_fondamenta_dati_veri.sql')).not.toContain('dopo la 0006')
  })

  it('i rollback di prima dicono di togliere prima la 0006', () => {
    const testata = (nome: string) => {
      const t = leggiTesto(nome)
      return t.slice(t.indexOf('-- ROLLBACK'), t.indexOf('\nbegin;\n'))
    }
    expect(testata('0003_clienti_preventivi.sql')).toContain('(0006, poi 0005, poi 0004')
    expect(testata('0004_fondamenta_dati_veri.sql')).toContain('Se la 0006 è applicata, PRIMA il suo rollback')
    expect(testata('0005_correzioni_revisione.sql')).toContain('Se la 0006 è applicata, PRIMA il suo rollback')
  })
})
