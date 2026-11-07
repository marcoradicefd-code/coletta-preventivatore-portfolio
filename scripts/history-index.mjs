/**
 * Rigenera l'indice in `docs/history.md` dai file di `docs/history/`.
 * Uso: `node scripts/history-index.mjs`
 *
 * Una voce è un file `AAAA-MM-GG-slug.md`: prima riga `# Titolo`, poi una riga
 * `> <giorno mese anno> · PR #N` (anche un intervallo, `PR #34–#45`; senza PR:
 * `· nessuna PR: <motivo>`). Dal file prende titolo, numero di PR e data (dal nome);
 * ordina per data, poi per numero di PR decrescente.
 *
 * Ogni PR aggiunge solo il proprio file: l'indice non lo scrive nessuno a mano, così due
 * PR dello stesso giorno non si scontrano sulla stessa riga.
 *
 * ⚠️ L'ancora è la riga di INTESTAZIONE della tabella, mai il separatore `|---|---|---|`,
 * che può comparire in altre tabelle dello stesso file: agganciarsi a quello riscriverebbe
 * una tabella a caso. Si sostituiscono solo le righe di tabella che seguono l'intestazione;
 * il resto del file non si tocca.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const DIR = 'docs/history'
const INDICE = 'docs/history.md'
const ANCORA = '| data | voce | PR |\n|---|---|---|\n'
const NOME = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/

const voci = readdirSync(DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    if (!NOME.test(f)) throw new Error(`${f}: il nome deve essere AAAA-MM-GG-slug.md`)
    const righe = readFileSync(`${DIR}/${f}`, 'utf8').split('\n')
    const titolo = righe[0].startsWith('# ') ? righe[0].slice(2).trim() : ''
    if (!titolo) throw new Error(`${f}: la prima riga deve essere «# Titolo»`)
    const testata = righe.find((r) => r.startsWith('> ')) ?? ''
    const pr = testata.match(/PR (#\d+(?:[–-]#?\d+)?)/)?.[1] ?? ''
    if (!pr && !testata.includes('nessuna PR'))
      throw new Error(`${f}: manca la riga «> giorno mese anno · PR #N» (o «· nessuna PR: motivo»)`)
    return {
      data: f.slice(0, 10),
      // Senza PR va in fondo fra le voci dello stesso giorno: «nessuna» non è un numero.
      n: pr ? Number(pr.match(/\d+/)[0]) : 0,
      riga: `| ${f.slice(0, 10)} | [${titolo}](history/${f}) | ${pr || '—'} |`,
    }
  })
  .sort((a, b) => b.data.localeCompare(a.data) || b.n - a.n)

const testo = readFileSync(INDICE, 'utf8')
if (testo.split(ANCORA).length !== 2)
  throw new Error(`${INDICE}: l'intestazione «| data | voce | PR |» deve comparire una volta sola`)
const [prima, resto] = testo.split(ANCORA)
const dopo = resto.replace(/^(\|.*\n)+/, '')
writeFileSync(INDICE, prima + ANCORA + voci.map((v) => v.riga).join('\n') + '\n' + dopo)
console.log(`${INDICE}: ${voci.length} voci rigenerate da ${DIR}/`)
