> ## ⚠️ DOCUMENTO STORICO per 7 dimensioni su 9 — testata del 07/10/2026, riga della vasca aggiunta il 12/10/2026, righe delle cucine e degli arredi corrette il 12/10/2026 (L16)
>
> Spec del 29/06/2026, eseguita in gran parte o superata da decisioni successive. Il testo
> sotto **non si corregge**: per ogni dimensione superata vale la colonna di destra. Il file va
> in `docs/archive/` solo quando sarà superato tutto.
>
> | dimensione | stato | dove sta la verità oggi |
> |---|---|---|
> | punto di partenza «oggi 2 moduli» (§ A.1, § B.2) | **SUPERATO**: le 5 sezioni sono in app | `SECTION_TABS` in `src/components/layout/sections.tsx`; `docs/overview.md` |
> | fasi di build (§ B.8) | **SUPERATO**: eseguite o divergite | `git log`; `docs/overview.md` |
> | porte, colonna «PREZZO 2026» fissa (§ A.4, § B.4) | **SUPERATO**: vale la colonna `PREZZO <anno>` più recente | `src/parsers/parsePorte.ts` |
> | parser `.ods` (§ B.4, § B.8) | **SUPERATO**: `.ods` deciso non necessario | `.claude/rules/listini.md` |
> | cucine «BLOCCATO», default a corpo (§ B.5-bis) | **SUPERATO**: configuratore con la struttura nel codice e i prezzi dal listino cucine (D7, dal 09/10/2026) | `src/engine/calcCucina.ts`, `src/data/cucina/`; `.claude/rules/engine.md` |
> | arredi, aggancio finiture (§ B.3) | **SUPERATO**: fatto, combobox delle finiture; i numeri di riga citati in § B.3 non valgono più | `src/components/sumisura/FinituraCombobox.tsx` |
> | vasca integrata a costo fisso (§ A.5 #2, § B.5, «Stato delle decisioni») | **SUPERATO**: la vasca segue la logica gres (decisione di Antonio, nel codice dal 16/07/2026): è una riga del gres, nel lordo, scontata come il resto e base dello scaglione del montaggio; il prezzo predefinito viene dal listino cucine | `src/engine/calcMarmeria.ts` (`totVasca`), `src/data/gres/vascaGres.ts` |
> | montaggio come voce separata (§ A.3, § A.5) | **VIVO**: non implementato | questo file; `docs/overview.md` § Orizzonte |
> | anagrafica clienti + import CSV (§ B.6) | **VIVO**: non implementato | questo file, § B.6; `docs/overview.md` § Orizzonte |

# SPEC — Fase 2: Preventivatore a 5 sezioni

> Documento unico. **Parte A** = decisioni di prodotto (da validare con Antonio).
> **Parte B** = blueprint tecnico (per Claude Code, build a fasi sequenziali).
> Le due parti sono allineate: se cambia una decisione in A, si aggiorna B.
>
> Fonti: risposte mail di Antonio (29/06/2026), i 7 file dei listini, il
> preventivo reale n.1147, e `ARCHITECTURE.md`. Dove una decisione è ancora
> aperta è marcato **🔶 BLOCCATO SU**; nulla è inventato.

---

# PARTE A — Prodotto

## A.1 Obiettivo

Trasformare il preventivatore (oggi 2 moduli: Su Misura + Marmeria) in uno
strumento a **5 sezioni**. **Non è additivo**: è una ristrutturazione. Il modulo
"Su Misura per articolo" esistente **diventa** la sezione *arredi* (confermato da
Antonio), non una sezione nuova.

## A.2 Le 5 sezioni

1. **Cucine** — quotazione di una cucina. 🔶 (vedi A.5: modello di compilazione).
2. **Arredi living / notte / bagno** — il modulo "per articolo" attuale: voce →
   larghezza/altezza, MQ/ML/PZ, finiture, maggiorazioni, note. **Riuso del codice
   esistente, rilocato in questa sezione.**
3. **Porte** — listino 41 modelli, prezzo a fasce per altezza + optional. **Nuova.**
4. **Progetto su misura "a valore"** — descrizione libera + prezzo a mano, **nessun
   calcolo automatico**. (Confermato da Antonio.)
5. **Gres / Marmeria** — il modulo marmeria attuale (listino De Bari). **Riuso del
   codice esistente, rilocato in questa sezione.**

## A.3 Regole trasversali

- **Preventivo unico multi-sezione:** un solo documento può contenere voci da più
  sezioni (es. cucina + porte + gres). (Confermato.)
- **Scontistica separata per sezione:** ogni sezione ha il suo sconto, non uno
  globale. (Confermato.)
- **IVA sempre esclusa** in tutti gli importi mostrati. (Confermato in precedenza.)
- **Montaggio:** voce separata, **fuori dalla scontistica**, scontabile a mano.
- **Quota progettazione:** **8%** per arredi/living/notte/bagno, **10%** per le
  cucine. (Confermato.) Per porte/gres/valore: nessuna progettazione automatica
  (🔶 vedi A.5).
- **Condizioni contrattuali:** in coda al PDF, già implementate (flag document-level).
- **Anagrafica clienti:** salvabile + import CSV. Obbligatori: nome, cognome, mail,
  telefono. (Confermato; schema completo in B.6.)

## A.4 Decisioni confermate da Antonio

| Tema | Decisione |
|---|---|
| Struttura | 5 sezioni, preventivo unico multi-sezione |
| Scontistica | separata per sezione |
| Progettazione | 8% arredi/living/notte/bagno · 10% cucine |
| Maggiorazioni su misura (arredi) | **sommate**: +20% (<3 MQ) + +15% (prof. >65 cm) = **base ×1,35** |
| "Su Misura per articolo" | = sezione **arredi** |
| Progetto "a valore" | solo testo libero + prezzo a mano |
| Porte — prezzo base | colonna **PREZZO 2026** (PREZZO 1 = 2024, ignorare) |
| Porte — optional | voci extra che si **sommano** alla base |
| Anagrafica | obbligatori nome+cognome+mail+telefono; import CSV |

## A.5 Punti aperti — default provvisori (da validare, NON bloccanti per partire)

| # | Punto | Default provvisorio (modificabile) | Impatto se cambia |
|---|---|---|---|
| 1 | **Cucine: modello** | "a corpo" come il *progetto a valore* (testo + prezzo + optional come righe), sul modello del 1147 | Se **configuratore** modulo-per-modulo → sezione nuova e corposa, spec dedicata |
| 2 | **Vasca integrata: prezzo** | **fisso, vedi listino cucine** (come nel 1147) | Se segue logica gres (prezzo pieno − sconto 0–50%) → diventa una voce gres, non fissa |
| 3 | **Montaggio: default** | **650 €** | Solo il valore preimpostato; nessun impatto strutturale |
| 4 | **Porte: meccanismo altezza** | **prezzo a fasce** (sostituzione: ≤215→PREZZO 2026, >215→col. H>215, >240→col. H>240), automatico in base all'altezza inserita | Se fosse additivo → cambia l'engine porte (improbabile: il file ha prezzi assoluti) |
| 5 | **Progettazione su porte/gres/valore** | non automatica (operatore la aggiunge a mano se serve) | Se Antonio la vuole automatica anche lì → flag+aliquota per quelle sezioni |

> Questi 5 punti sono nella mail già inviata ad Antonio. Si parte coi default e si
> rifinisce alla sua risposta / call. Solo il **#1 (cucine)** è un bivio strutturale.

---

# PARTE B — Tecnica (blueprint)

## B.1 Impatto sull'architettura — il nodo da smontare

Oggi `useQuoteStore` è il **bridge centrale** (betweenness 0.162, consumato da ~14
componenti; vedi `ARCHITECTURE.md §4`) con stato a due moduli: `suMisura`,
`marmeria`. La Fase 2 lo trasforma in **stato per-sezione**:

```
Preventivo
 ├─ cliente
 ├─ sezioni: {
 │     cucine?:        { righe[], sconto }
 │     arredi?:        { articoli[], sconto }      ← ex "suMisura"
 │     porte?:         { righe[], sconto }
 │     progettoValore?:{ righe[], sconto }
 │     gres?:          { … , sconto }              ← ex "marmeria"
 │  }
 ├─ montaggio: { importo, scontoManuale }          // fuori scontistica
 └─ includiCondizioni: boolean
```

Principi:
- **Ogni sezione ha il suo `sconto`** (regola A.3). Il totale è la somma dei totali
  di sezione (ognuno già scontato) + montaggio + progettazione per-sezione.
- **Selettori per-sezione** con riferimenti stabili fuori dai componenti
  (`EMPTY_ARR`), per non reintrodurre i loop di re-render (vedi `ARCHITECTURE.md §4`).
- **Persist:** bump della versione `coletta-quote-v1` (oggi v3 → **v4**) con
  `migrate` che mappa il vecchio `{suMisura, marmeria}` su `{sezioni.arredi,
  sezioni.gres}` per non perdere i preventivi salvati.

> ⚠️ Prima di scrivere: Claude Code deve **rileggere** `quoteStore.ts` reale e
> proporre il diff dello store, non assumere la forma esatta.

## B.2 Routing / AppShell

- Navigazione a **5 sezioni** (oggi 2 tab Su Misura/Marmeria + Cliente). Le sezioni
  vuote non compaiono nel PDF ma sono selezionabili per l'inserimento.
- `AppShell` continua a montare `PreventivoPrint` ed esporre `handlePrint`
  (`ARCHITECTURE.md §7`): il PDF resta unico, cambia solo cosa renderizza.

## B.3 Sezione ARREDI (ex Su Misura per articolo) — riuso + aggancio finiture

- **Codice esistente rilocato.** Engine `calcArticolo` invariato (maggiorazioni già
  ×1,35, confermato — `ARCHITECTURE.md §6`).
- **Aggancio del modulo finiture** (già in repo, `src/data/finiture/`): i 3 campi
  oggi a stringa libera in `ArticoloConfigModal` — `finituraInterna`,
  `finituraEsterna`, `codiceFinitura` (`types/sumisura.ts:40-42`) — diventano dropdown
  alimentati da `coloriFiniture` (RAL/NCS/Sikkens, con swatch `hex`) e `laminatiAbet`.
  Mantenere la possibilità di inserimento manuale (codice non a catalogo).

## B.4 Sezione PORTE (nuova) — parser + model + engine

**Dati (da `LISTINO PORTE COLETTA EBANISTERIA.ods`):**
- 41 modelli. Colonne: `MODELLO · PREZZO 2026 · H>215 · H>240` (PREZZO 1 scartato).
- **H>215 / H>240 sono prezzi assoluti alternativi** (fasce per altezza), NON
  sovrapprezzi additivi. Es. RAFFAELLA: 880 → 1.060 → 1.150.
- Un modello senza PREZZO 1 (LINEA FILOMURO LACCATA): solo 2026/H>215/H>240.

**Optional (foglio `optional`, ≥6 modelli di prezzo):**
- **Fisso €/porta, sommato** (stipiti, ferramenta, binario magic, apertura libro,
  extra larghezza >90, mantovana): 150–300 €.
- **€/MQ:** specchio tradizionale 40, bronzo/fumo 60, vetro cannettato 80.
- **€/PEZZO:** pivot FritsJürgens 1.500.
- **€/ML a formula:** battiscopa massello = **1,2 €/cm di altezza**; variante
  "lavorazione extra" = **+20%** sul battiscopa.
  → **Implementato** come riga a corpo fuori dagli optional (PR #33) e, dal 06/10
  (PR #42), con `prezzoMl = altezza × €/cm`, `× metri lineari`, più la posa €/ml a
  mano; +20% solo sul prodotto; una riga per altezza.
- **Campo manuale:** porta impiallacciata altre essenze (prezzo a mano).

**Engine porte:**
```
prezzoBase(modello, altezza) =
   altezza <= 215  → PREZZO_2026
   215 < altezza <= 240 → col. H>215
   altezza > 240   → col. H>240
totalePorta = prezzoBase + Σ optional(secondo l'unità: €/porta | €/mq | €/pezzo | €/ml | manuale)
totaleSezione = Σ porte, poi sconto sezione
```
- Parser `.ods` per-intestazione (come per Marmeria; `ARCHITECTURE.md §5`), Zod
  fail-loud. (Conferma meccanismo altezza = punto aperto A.5 #4, ma il file mostra
  prezzi assoluti → si progetta già a fasce.)

## B.5 Sezione GRES / Marmeria (ex Marmeria) — riuso

- Codice esistente rilocato. **Vasca integrata:** 🔶 punto A.5 #2 — di default voce
  a costo fisso (vedi listino cucine); se Antonio conferma la logica gres, diventa una voce
  materiale scontabile invece di un fisso.

## B.5-bis Sezione PROGETTO A VALORE & CUCINE

- **Progetto a valore:** banale — righe `{ descrizione: string, prezzo: number }`,
  sommate, con sconto sezione. Nessun calcolo.
- **🔶 CUCINE — BLOCCATO SU A.5 #1.**
  - *Se "a corpo" (default):* identico al *progetto a valore* (testo + prezzo a
    corpo + optional come righe), con progettazione 10%. Costo implementativo minimo.
  - *Se "configuratore":* nuovo modulo (basi/colonne/pensili modulo-per-modulo) →
    **spec dedicata**, fuori da questo documento. **Non procedere finché Antonio
    non decide.**

## B.6 Anagrafica clienti + import CSV

- **Schema** (dal CSV di esempio inviato): `codice_cliente · tipo(persona|azienda) ·
  nome · cognome · ragione_sociale · telefono · email · codice_fiscale · partita_iva
  · indirizzo · cap · citta · provincia · pagamento · note`. Obbligatori (persona):
  nome, cognome, email, telefono.
- **🔒 RICERCA-DOC PRIMA (regola fondamentale):** la persistenza richiede una tabella
  Supabase + RLS. **Leggere la documentazione Supabase** (tabella `clienti`, RLS per
  utenti admin, eventuale import) *prima* di proporre lo schema SQL. Niente reattivo.
- Import: parser CSV (PapaParse o simile), validazione Zod riga-per-riga, gestione
  duplicati per `codice_cliente`, preview prima del commit.

## B.7 PDF unico (modello 1147)

- Un blocco per sezione presente (titolo sezione + righe + subtotale + sconto sezione).
- **Montaggio** come riga a sé, fuori dagli sconti.
- **Progettazione** per-sezione dove applicabile (8%/10%).
- **Totale generale** = Σ sezioni scontate + montaggio + progettazione.
- Condizioni contrattuali in coda (già fatto). IVA esclusa ovunque (già fatto).
- Riferimento visivo: il preventivo reale **1147** (arredo a corpo + cucina a corpo
  + top gres + vasca + montaggio + condizioni).

## B.8 Fasi di build (sequenziali, con dipendenze)

Lo **shell deve esistere prima** delle sezioni. Ordine proposto:

1. **Store per-sezione + persist v3→v4 + migrate.** (Fondamenta. Rivedere
   `quoteStore.ts` reale prima.)
2. **AppShell / routing a 5 sezioni.** (Dipende da 1.)
3. **PDF unico multi-sezione** (subtotali, sconto per sezione, montaggio,
   progettazione, totale). (Dipende da 1–2; modello 1147.)
4. **Riloca ARREDI** nello shell + **aggancia finiture** (dropdown RAL/NCS/Sikkens
   + ABET). (Dipende da 1–3.)
5. **Riloca GRES/Marmeria** nello shell. (Dipende da 1–3.)
6. **Progetto a valore** (testo+prezzo). (Dipende da 1–3, banale.)
7. **Porte** (parser .ods + model + UI + engine a fasce + optional). (Dipende da 1–3.)
8. **Cucine** — 🔶 solo dopo decisione A.5 #1.
9. **Anagrafica + import CSV** — 🔒 dopo ricerca-doc Supabase. Indipendente dalle
   sezioni; può procedere in parallelo concettuale ma con commit propri.

> Build a **commit atomici sequenziali con review del diff**. Niente subagent
> paralleli sul build (stato condiviso store/AppShell/PDF → conflitti). Subagent ok
> solo per analisi read-only. `/compact` al ~60%, "consulta il grafo Graphify".

## B.9 Cose da NON dimenticare (dall'audit)

- **Vite 8:** Node ≥ 20.19/22.12; `worker.rolldownOptions` se si toccano opzioni worker.
- **TS 6.0.x:** restare; no TS 7 fino a GA/7.1.
- **Auth:** "Before User Created Hook" come opzione futura (non urgente).
- **Maggiorazioni arredi** già ×1,35; **xlsx** già 0.20.3 confinato nel worker.

---

## Stato delle decisioni (sintesi)

- **Pronto a partire ora (no blocchi):** store per-sezione, AppShell, PDF, riloco
  arredi+finiture, riloco gres, progetto a valore, porte.
- **Bloccato su Antonio:** cucine (modello), e rifiniture su vasca/montaggio/
  progettazione-altre-sezioni (default già in place).
- **Bloccato su ricerca-doc:** anagrafica/Supabase (tabella + RLS).
