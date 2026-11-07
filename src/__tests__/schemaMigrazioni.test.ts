import { describe, it, expect } from 'vitest'
import { contaCreatePolicy, leggiMigration, migrazioniDa0003, policiesDi } from '@/test-utils/sqlMigration'

/**
 * Regole di OGNI migration dalla 0003 in poi (revisione L15-L21, S4). I
 * contratti di file (0003, 0004, 0005) asseriscono ciò che c'è; questo
 * asserisce ciò che non deve esserci, anche in una riga aggiunta in coda o in
 * una migration nuova: sei mutazioni che spegnevano l'RLS, toglievano un
 * trigger o aggiungevano una policy in una forma che il parser non leggeva
 * restavano verdi. Una migration nuova entra qui da sola (`migrazioniDa0003`).
 * I commenti sono tolti prima di leggere: le testate citano anon e i rollback.
 */
const FILE = migrazioniDa0003()

describe('le migration dalla 0003: regole di sicurezza di ogni file', () => {
  it('ci sono almeno la 0003, la 0004 e la 0005', () => {
    expect(FILE.slice(0, 3).map((f) => f.slice(0, 4))).toEqual(['0003', '0004', '0005'])
  })

  describe.each(FILE)('%s', (nome) => {
    const sql = leggiMigration(nome)

    it('niente RLS spenta o non forzata, niente DROP di trigger, policy, tabelle, funzioni, viste o schemi', () => {
      expect(sql).not.toMatch(/disable row level security|no force row level security/)
      expect(sql).not.toMatch(/\bdrop (trigger|policy|table|function|view|schema)\b/)
    })

    it('ogni create policy è letta dal parser, ed è solo per authenticated', () => {
      const policies = policiesDi(sql)
      expect(policies).toHaveLength(contaCreatePolicy(sql))
      for (const p of policies) expect(p.ruoli, p.nome).toEqual(['authenticated'])
    })

    it('ogni tabella creata ha RLS enable e force nello stesso file', () => {
      for (const [, t] of sql.matchAll(/create table public\.(\w+)/g)) {
        expect(sql, `${t}: enable`).toContain(`alter table public.${t} enable row level security;`)
        expect(sql, `${t}: force`).toContain(`alter table public.${t} force row level security;`)
      }
    })

    it('nessun grant ad anon né a public; ogni SECURITY DEFINER ha search_path vuoto', () => {
      expect(sql).not.toMatch(/grant [^;]* to [^;]*\b(anon|public)\b/)
      for (const [corpo] of sql.matchAll(/create (?:or replace )?function public\.\w+\(.*?\$\$;/g)) {
        if (corpo.includes('security definer')) expect(corpo).toContain("set search_path = ''")
      }
    })
  })
})
