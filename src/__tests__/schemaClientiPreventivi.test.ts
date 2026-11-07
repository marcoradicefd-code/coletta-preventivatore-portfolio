import { describe, it, expect } from 'vitest'
import { corpoFunzione as corpoIn, leggiMigration, policiesDi, ramiTrigger } from '@/test-utils/sqlMigration'

/**
 * Contratto dello schema di `0003_clienti_preventivi.sql` (L21, PR A).
 *
 * La migration non la applica la suite: la applica Marco dal SQL Editor. Qui si
 * legge il file e si pretendono le proprietà di sicurezza che la PR promette,
 * così una modifica che le toglie fa rosso PRIMA di arrivare al database:
 * RLS enable + force su ogni tabella, nessuna policy né grant per anon, DELETE
 * solo admin, contatore senza scrittura, funzione del numero SECURITY DEFINER
 * con search_path vuoto, EXECUTE solo ad authenticated.
 *
 * Rinforzato in L21-B (verdetto sulla #96, osservazione 7): la lista dei ruoli
 * si legge intera, il corpo di ogni policy è quello atteso parola per parola
 * (un `or true` fa rosso), e le `raise` dei trigger e della funzione del numero
 * si asseriscono con la condizione che le fa scattare. I commenti (`--`) si
 * tolgono prima di leggere: la testata contiene le query di verifica.
 */
const sql = leggiMigration('0003_clienti_preventivi.sql')

const TABELLE = ['clienti', 'preventivi', 'contatori_preventivi']

const policies = policiesDi(sql)

/** Il corpo di una funzione di questo file. */
const corpoFunzione = (nome: string) => corpoIn(sql, nome)

/** La condizione di tutte le policy: un profilo. Esatta: niente `or true` né altro in coda. */
const PROFILO = '(exists (select 1 from public.profiles p where p.id = (select auth.uid())))'
const ADMIN = "(exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))"

describe('schema clienti e preventivi (0003): contratto di sicurezza', () => {
  it('crea esattamente le tre tabelle, e ognuna ha RLS enable e force', () => {
    const create = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1])
    expect(create.sort()).toEqual([...TABELLE].sort())
    for (const t of TABELLE) {
      expect(sql, `${t}: enable`).toContain(`alter table public.${t} enable row level security;`)
      expect(sql, `${t}: force`).toContain(`alter table public.${t} force row level security;`)
    }
  })

  it('nessuna policy, grant o privilegio per anon', () => {
    expect(sql).not.toMatch(/to anon\b/)
    expect(sql).not.toMatch(/grant [^;]* to [^;]*\banon\b/)
    expect(policies).toHaveLength(9)
    for (const p of policies) expect(p.ruoli, p.nome).toEqual(['authenticated'])
    expect(sql).toContain('revoke all on table public.clienti, public.preventivi, public.contatori_preventivi from anon;')
  })

  it('ogni policy chiede un profilo, col corpo esatto, e solo SELECT/INSERT/UPDATE/DELETE su clienti e preventivi', () => {
    // Il corpo intero, non un «contiene»: `using (… or true)` deve fare rosso.
    const atteso: Record<string, string> = {
      select: `using ${PROFILO}`,
      insert: `with check ${PROFILO}`,
      update: `using ${PROFILO} with check ${PROFILO}`,
      delete: `using ${ADMIN}`,
    }
    for (const p of policies) expect(p.corpo.trim(), p.nome).toBe(atteso[p.comando])
    for (const t of ['clienti', 'preventivi']) {
      const comandi = policies.filter((p) => p.tabella === t).map((p) => p.comando).sort()
      expect(comandi, t).toEqual(['delete', 'insert', 'select', 'update'])
    }
  })

  it('DELETE solo admin, e solo su clienti e preventivi', () => {
    const del = policies.filter((p) => p.comando === 'delete' || p.comando === 'all')
    expect(del.map((p) => p.tabella).sort()).toEqual(['clienti', 'preventivi'])
    for (const p of del) expect(p.corpo, p.nome).toContain("p.role = 'admin'")
    for (const p of policies.filter((x) => x.comando !== 'delete')) {
      expect(p.corpo, p.nome).not.toContain("'admin'")
    }
  })

  it('contatori_preventivi: solo lettura, nessuna policy né privilegio di scrittura', () => {
    expect(policies.filter((p) => p.tabella === 'contatori_preventivi').map((p) => p.comando)).toEqual(['select'])
    expect(sql).toContain('revoke insert, update, delete on table public.contatori_preventivi from authenticated;')
    expect(sql).toContain(
      'revoke truncate, references, trigger on table public.clienti, public.preventivi, public.contatori_preventivi from authenticated;'
    )
  })

  it('la funzione del numero: SECURITY DEFINER, search_path vuoto, controllo del profilo, una istruzione atomica', () => {
    const f = corpoFunzione('assegna_numero_preventivo')
    expect(f).toContain('returns int')
    expect(f).toContain('security definer')
    expect(f).toContain("set search_path = ''")
    expect(f).toMatch(/if auth\.uid\(\) is null or not exists \(select 1 from public\.profiles p where p\.id = auth\.uid\(\)\) then raise exception/)
    // Il controllo dell'anno, con la sua raise: entro un anno da quello del server.
    expect(f).toContain(
      "if p_anno is null or p_anno < v_anno_server - 1 or p_anno > v_anno_server + 1 then raise exception 'anno del preventivo non valido' using errcode = '22023'; end if;"
    )
    expect(f).toContain(
      'insert into public.contatori_preventivi as c (anno, ultimo) values (p_anno, 1) on conflict (anno) do update set ultimo = c.ultimo + 1 returning c.ultimo into v_numero;'
    )
    // Nessun SELECT del contatore seguito da un UPDATE: sarebbe la lettura-poi-scrittura
    // che due salvataggi insieme sbagliano.
    expect(f).not.toMatch(/select [^;]*from public\.contatori_preventivi/)
    expect(f).not.toMatch(/update public\.contatori_preventivi/)
  })

  it('EXECUTE sulla funzione del numero: tolto a public e anon, dato solo ad authenticated', () => {
    expect(sql).toContain('revoke all on function public.assegna_numero_preventivo(int) from public, anon;')
    const grant = [...sql.matchAll(/grant execute on function ([^;]*) to ([^;]*);/g)].map((m) => [m[1].trim(), m[2].trim()])
    expect(grant).toEqual([['public.assegna_numero_preventivo(int)', 'authenticated']])
  })

  it('ogni SECURITY DEFINER ha search_path vuoto; le funzioni di trigger sono SECURITY INVOKER e senza EXECUTE', () => {
    const funzioni = [...sql.matchAll(/create function public\.(\w+)\(/g)].map((m) => m[1])
    expect(funzioni.sort()).toEqual(['assegna_numero_preventivo', 'controlla_preventivo', 'imposta_audit_clienti'])
    for (const nome of funzioni) {
      const f = corpoFunzione(nome)
      expect(f, nome).toContain("set search_path = ''")
      if (nome !== 'assegna_numero_preventivo') {
        expect(f, nome).not.toContain('security definer')
        expect(sql, nome).toContain(`revoke execute on function public.${nome}() from public, anon, authenticated;`)
      }
    }
  })

  it('trigger dei preventivi: il numero non oltre il contatore, e anno, numero e revisione immutabili (raise asserite)', () => {
    const { insert, update } = ramiTrigger(corpoFunzione('controlla_preventivo'))
    expect(insert).toContain(
      "if not exists (select 1 from public.contatori_preventivi c where c.anno = new.anno and new.numero <= c.ultimo) then raise exception 'numero di preventivo non assegnato' using errcode = '23514'; end if;"
    )
    expect(update).toContain(
      "if new.anno is distinct from old.anno or new.numero is distinct from old.numero or new.revisione is distinct from old.revisione then raise exception 'anno, numero e revisione di un preventivo non cambiano' using errcode = '23514'; end if;"
    )
  })

  it('created_by e updated_by li fissa il trigger, mai il client (clienti e preventivi)', () => {
    for (const nome of ['imposta_audit_clienti', 'controlla_preventivo']) {
      const corpo = corpoFunzione(nome)
      const { insert, update } = ramiTrigger(corpo)
      expect(insert, nome).toContain('new.created_at := now(); new.created_by := auth.uid();')
      expect(update, nome).toContain('new.created_at := old.created_at; new.created_by := old.created_by;')
      expect(corpo, nome).toMatch(/end if; new\.updated_at := now\(\);( new\.updated_by := auth\.uid\(\);)? return new; end; \$\$;$/)
    }
    expect(corpoFunzione('controlla_preventivo')).toContain('new.updated_at := now(); new.updated_by := auth.uid(); return new;')
  })

  it('niente codice fiscale; numero unico per (anno, numero, revisione); cliente con preventivi non si cancella', () => {
    expect(sql).not.toMatch(/codice_fiscale|codicefiscale|\bcf\b/)
    expect(sql).toContain('unique (anno, numero, revisione)')
    expect(sql).toContain('cliente_id uuid not null references public.clienti (id) on delete restrict')
    expect(sql).toContain("check (stato in ('bozza', 'inviato', 'accettato', 'annullato'))")
  })

  it('tutto in una transazione, con la precondizione su BYPASSRLS prima di creare qualcosa', () => {
    expect(sql.trimStart().startsWith('begin;')).toBe(true)
    expect(sql.trimEnd().endsWith('commit;')).toBe(true)
    expect(sql.indexOf('rolbypassrls')).toBeLessThan(sql.indexOf('create table'))
  })
})
