import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
  RefreshCw,
  CheckCircle2,
  Info,
  AlertCircle,
  X,
} from 'lucide-react'
import { supabase, LISTINI_BUCKET } from '@/lib/supabase'
import {
  usePricelistStore,
  categorizzaListino,
  ETICHETTA,
  leggiListino,
  esaminaListino,
  messaggioLettura,
  type ListinoEsaminato,
} from '@/store/pricelistStore'
import { nomeSidecar, serializzaSelezione, type SelezioneFogli } from '@/lib/selezioneFogli'
import { useConferma } from '@/hooks/useConferma'
import { useToast } from '@/components/shared/toastContext'
import { sanitizeNomeFile, avvisoCollisioneCategoria } from './nomeFileListino'
import { listContainerVariants, listItemVariants } from '@/styles/variants'
import type { ListinoSuMisura } from '@/types/sumisura'

interface ListinoFile {
  name: string
  updated_at?: string
  size?: number
}

const MAX_SIZE_MB = 10
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
const VALID_EXT = /\.(xlsx|xls)$/i

/**
 * Firme dei due formati che accettiamo, lette dai primi byte del FILE.
 *
 * Non si controlla `file.type`: il browser lo deriva dall'estensione, cioè dalla
 * stessa stringa che `VALID_EXT` ha già guardato — un `.txt` rinominato `.xlsx`
 * arriva con type `application/vnd.openxmlformats-...`. Sarebbe teatro.
 *
 * Perché vale la pena: `loadDefaults` prende i file ordinati per `updated_at`
 * decrescente e fa `.find()` per categoria — vince il PIÙ RECENTE. Un file
 * illeggibile che entra nel bucket non è spazzatura inerte: diventa il più nuovo
 * della sua categoria e OSCURA il listino buono, che smette di caricarsi finché
 * qualcuno non lo cancella.
 */
const FIRME_EXCEL: readonly number[][] = [
  [0x50, 0x4b, 0x03, 0x04], // xlsx → è uno ZIP ("PK")
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // xls → OLE2 Compound File
]

/** `true` se i primi byte sono quelli di un .xlsx o di un .xls veri. */
async function haFirmaExcel(file: File): Promise<boolean> {
  const testa = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  return FIRME_EXCEL.some((firma) => firma.every((b, i) => testa[i] === b))
}

/**
 * Il referto: cosa è entrato davvero in ogni listino, sempre visibile.
 *
 * Non blocca niente. Serve contro il fallimento peggiore, che non è l'errore ma
 * il silenzio: 51 voci ieri, 3 oggi, e nessuno se ne accorge. Qui la differenza
 * si legge in un secondo.
 */
function RefertiPanel() {
  const referti = usePricelistStore((s) => s.referti)
  const righe = (
    [
      [ETICHETTA.sumisura, referti.suMisura],
      [ETICHETTA.marmeria, referti.marmeria],
      [ETICHETTA.porte, referti.porte],
      [ETICHETTA.cucine, referti.cucine],
    ] as const
  ).filter(([, r]) => r !== null)

  if (righe.length === 0) return null

  return (
    <div className="mb-6 rounded-lg border border-separator-opaque bg-surface-secondary p-5">
      <h3 className="text-sm font-semibold text-ink-primary mb-3">Cosa è caricato in memoria</h3>
      <div className="space-y-3">
        {righe.map(([etichetta, r]) => (
          <div key={etichetta} className="text-[12px]">
            <div className="text-ink-primary font-medium">
              {etichetta} <span className="text-ink-tertiary font-normal">— {r!.file}</span>
            </div>
            <div className="text-ink-secondary mt-0.5">
              {r!.caricati.map((c) => `${c.nome}: ${c.voci}`).join(' · ')}
            </div>
            {r!.caricati
              .filter((c) => c.combinazioni)
              .map((c) => (
                <div key={c.nome} className="text-ink-secondary mt-0.5">
                  {c.nome}, combinazioni lette: {c.combinazioni!.reduce((n, t) => n + t.numero, 0)} (
                  {c.combinazioni!.map((t) => `${t.tipo} ${t.numero}`).join(' · ')})
                </div>
              ))}
            {r!.esclusi.length > 0 && (
              <div className="text-ink-tertiary mt-0.5">
                Esclusi: {r!.esclusi.map((e) => `${e.nome} (${e.motivo})`).join(' · ')}
              </div>
            )}
            {r!.note.map((n) => (
              <div key={n} className="text-warning mt-0.5">
                ⚠ {n}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function GestioneListini() {
  const [files, setFiles] = useState<ListinoFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Passo intermedio dell'upload su misura: il file è già stato letto e parsato,
  // Antonio deve dire quali fogli sono listino (E14). `null` = nessuna selezione
  // in corso, cioè il flusso di sempre.
  const [daSelezionare, setDaSelezionare] = useState<{
    file: File
    nome: string
    /** Il listino già letto: alla conferma si esamina coi fogli scelti, senza un altro parse. */
    parsed: ListinoSuMisura
    fogli: Array<{ nome: string; voci: number; combinazioni: number }>
    scelti: string[]
  } | null>(null)
  /**
   * Perché il file NON è entrato nel bucket: formato, dimensione, o un errore
   * dello Storage. Inline e persistente finché non se ne tenta un altro; prima
   * stava in un toast da 3,5s, cioè spariva mentre Antonio guardava altrove e il
   * file non c'era.
   *
   * Dalla #58 passa di qui anche il verdetto del PARSER su un file nuovo: il file
   * si legge e si esamina PRIMA dell'upload, e se non è un listino valido non
   * entra nel bucket (A4). L'altro canale resta per i file GIÀ nel bucket:
   * `loadDefaults` → `pricelistStore.errors` → mirror di AppShell.
   *
   * Il toast resta ai successi, che sono notizie di un istante.
   */
  const [esitoUpload, setEsitoUpload] = useState<{
    tono: 'errore' | 'avviso'
    testo: string
  } | null>(null)

  const { showToast } = useToast()
  const { chiedi, finestra } = useConferma()
  const loadDefaults = usePricelistStore((s) => s.loadDefaults)
  const impostaListino = usePricelistStore((s) => s.impostaListino)
  // Nomi dei file attualmente caricati in memoria dallo store: sono
  // la verità su cosa l'app sta effettivamente usando. Se lo store non
  // è ancora popolato (loadDefaults in flight o fallito), usiamo la
  // find()-logic locale come fallback.
  const loadedSuMisuraName = usePricelistStore((s) => s.suMisura?.aggiornato ?? null)
  const loadedMarmeriaName = usePricelistStore((s) => s.marmeria?.aggiornato ?? null)
  const loadedPorteName = usePricelistStore((s) => s.porte?.aggiornato ?? null)
  const loadedCucineName = usePricelistStore((s) => s.cucine?.aggiornato ?? null)
  const erroriListini = usePricelistStore((s) => s.errors)

  // `loading` parte già vero: la prima lettura non lo accende, così l'effect di
  // montaggio non fa setState sincroni. Le ricariche passano da `ricaricaElenco`.
  // Non rigetta mai: anche un errore di rete chiude il "..." e lo dice.
  const fetchFiles = useCallback(async () => {
    try {
      const { data, error } = await supabase.storage.from(LISTINI_BUCKET).list('', {
        limit: 100,
        sortBy: { column: 'updated_at', order: 'desc' },
      })
      if (error) {
        showToast(`Errore caricamento elenco: ${error.message}`, 'error')
        setFiles([])
      } else {
        const filtered = (data ?? [])
          .filter((f) => VALID_EXT.test(f.name))
          .map((f) => ({
            name: f.name,
            updated_at: f.updated_at ?? f.created_at ?? undefined,
            size: (f.metadata as { size?: number } | null)?.size,
          }))
        setFiles(filtered)
      }
    } catch (e) {
      showToast(`Errore caricamento elenco: ${e instanceof Error ? e.message : String(e)}`, 'error')
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const ricaricaElenco = useCallback(() => {
    setLoading(true)
    return fetchFiles()
  }, [fetchFiles])

  useEffect(() => {
    void fetchFiles()
  }, [fetchFiles])

  /**
   * Carica file (+ eventuale selezione fogli) nel bucket.
   *
   * ORDINE: prima il sidecar, poi il file. Una selezione orfana è INERTE — chi
   * legge verifica che si riferisca al file presente, e se non torna la ignora.
   * Un file senza selezione invece caricherebbe tutti i fogli: sarebbe il
   * silenzio che stiamo chiudendo. Se il file fallisce dopo che il sidecar è
   * passato, il sidecar va rimosso; se anche la rimozione fallisce, pazienza:
   * degrada a ieri per costruzione.
   */
  const caricaNelBucket = useCallback(
    async (file: File, nomeFile: string, fogliScelti: string[] | null): Promise<string | null> => {
      if (fogliScelti) {
        const selezione: SelezioneFogli = {
          v: 1,
          fogli: fogliScelti,
          file: { nome: nomeFile, size: file.size },
        }
        const { error } = await supabase.storage
          .from(LISTINI_BUCKET)
          .upload(nomeSidecar(nomeFile), new Blob([serializzaSelezione(selezione)], { type: 'application/json' }), {
            upsert: true,
            contentType: 'application/json',
          })
        if (error) return `Errore salvataggio selezione fogli: ${error.message}`
      }

      const { error } = await supabase.storage.from(LISTINI_BUCKET).upload(nomeFile, file, {
        upsert: true,
        contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      if (error && fogliScelti) {
        // Il file non è passato: la selezione appena scritta non deve restare a
        // parlare di un file che non c'è (o peggio, del file PRECEDENTE).
        await supabase.storage.from(LISTINI_BUCKET).remove([nomeSidecar(nomeFile)])
      }
      return error ? `Errore upload: ${error.message}` : null
    },
    []
  )

  /** Un errore inatteso: il motivo nel banner, la drop zone di nuovo usabile. */
  const uploadFallito = useCallback((e: unknown) => {
    setEsitoUpload({
      tono: 'errore',
      testo: `Errore durante il caricamento: ${e instanceof Error ? e.message : String(e)}`,
    })
    setUploading(false)
    setUploadProgress(0)
  }, [])

  /**
   * Carica nel bucket un file GIÀ esaminato, e solo se l'upload riesce mette in
   * memoria il listino esaminato: niente secondo parse, niente `loadDefaults`
   * (che riscaricava e riparsava tutto). Upload in errore → lo store non cambia.
   */
  const caricaEApplica = useCallback(
    async (file: File, nomeFile: string, fogliScelti: string[] | null, esame: ListinoEsaminato) => {
      // NON azzera `esitoUpload`: a pulire è `iniziaUpload`, l'unico punto d'ingresso.
      // Se azzerasse anche qui, cancellerebbe l'avviso di collisione appena mostrato.
      setUploading(true)
      setUploadProgress(10)

      // Barra "indeterminata" simulata — Supabase Storage non espone progress
      const progressTimer = window.setInterval(() => {
        setUploadProgress((p) => (p < 85 ? p + 5 : p))
      }, 120)

      // Non rigetta mai: un'eccezione lasciava `uploading` acceso per sempre, con
      // la drop zone bloccata e il timer della barra in giro.
      try {
        const errore = await caricaNelBucket(file, nomeFile, fogliScelti)
        setUploadProgress(100)

        if (errore) {
          setEsitoUpload({ tono: 'errore', testo: errore })
          setUploading(false)
          setUploadProgress(0)
          return
        }

        setDaSelezionare(null)
        impostaListino(esame)
        showToast(`"${nomeFile}" caricato con successo`, 'success')
        await ricaricaElenco()

        setTimeout(() => {
          setUploading(false)
          setUploadProgress(0)
        }, 400)
      } catch (e) {
        uploadFallito(e)
      } finally {
        window.clearInterval(progressTimer)
      }
    },
    [ricaricaElenco, impostaListino, showToast, caricaNelBucket, uploadFallito]
  )

  /** Il file non è un listino valido: il motivo resta a schermo e niente entra nel bucket (A4). */
  const rifiuta = useCallback((testo: string) => {
    setEsitoUpload({ tono: 'errore', testo })
    setUploading(false)
    setUploadProgress(0)
  }, [])

  /**
   * Punto d'ingresso dal drop / dal file picker.
   *
   * Il file si LEGGE e si ESAMINA (parse + intestazioni + Zod) PRIMA dell'upload,
   * per tutte e tre le categorie: un file che non è un listino valido non entra
   * nel bucket, dove oscurerebbe (nome nuovo) o distruggerebbe (stesso nome,
   * `upsert`) quello buono (A4). Su misura in più chiede quali fogli sono listino
   * (E14), poi si riesamina coi fogli scelti, sullo stesso parse.
   */
  const iniziaUpload = useCallback(
    async (file: File) => {
      // Unico punto d'ingresso: qui si riparte puliti, l'esito è sempre quello
      // dell'ultimo tentativo.
      setEsitoUpload(null)
      // Non rigetta mai: anche la lettura della firma può fallire (il file
      // cambiato su disco dopo la scelta), e l'errore va detto, non perso.
      try {
        if (!VALID_EXT.test(file.name)) {
          setEsitoUpload({ tono: 'errore', testo: 'Formato non valido. Usa .xlsx o .xls' })
          return
        }
        if (file.size > MAX_SIZE_BYTES) {
          setEsitoUpload({ tono: 'errore', testo: `File troppo grande. Massimo ${MAX_SIZE_MB} MB` })
          return
        }
        if (!(await haFirmaExcel(file))) {
          setEsitoUpload({
            tono: 'errore',
            testo:
              `"${file.name}" ha l'estensione giusta ma non è un file Excel: i primi byte ` +
              `dicono altro. Se l'hai rinominato a mano, riaprilo e riesportalo da Excel.`,
          })
          return
        }

        // Da qui in poi vale il nome SANITIZZATO, non `file.name`: è quello che
        // finisce nel bucket, quindi quello che l'utente deve vedere e quello che
        // `categorizzaListino` leggerà dal listing.
        const nomeFile = sanitizeNomeFile(file.name)
        const avviso = avvisoCollisioneCategoria(nomeFile)
        if (avviso) setEsitoUpload({ tono: 'avviso', testo: avviso })
        const categoria = categorizzaListino(nomeFile)

        setUploading(true)
        let letto
        try {
          letto = await leggiListino(categoria, await file.arrayBuffer(), nomeFile)
        } catch (e) {
          rifiuta(messaggioLettura(categoria, e))
          return
        }

        // Con tutti i fogli: un file che non è un listino si ferma qui, prima
        // ancora di chiedere quali fogli tenere.
        const esito = esaminaListino(letto, nomeFile)
        if (!esito.ok) {
          rifiuta(esito.errore)
          return
        }

        if (letto.categoria === 'sumisura') {
          setUploading(false)
          setDaSelezionare({
            file,
            nome: nomeFile,
            parsed: letto.parsed,
            fogli: letto.parsed.fogli.map((f) => ({ nome: f.nome, voci: f.voci.length, combinazioni: f.matrice?.length ?? 0 })),
            // Tutti spuntati di default: è una CONFERMA, non un compito. Chi non
            // tocca niente ottiene esattamente il comportamento di ieri.
            scelti: letto.parsed.fogli.map((f) => f.nome),
          })
          return
        }

        await caricaEApplica(file, nomeFile, null, esito.esame)
      } catch (e) {
        uploadFallito(e)
      }
    },
    [caricaEApplica, rifiuta, uploadFallito]
  )

  /** Conferma della selezione fogli: esame coi fogli scelti, poi upload. */
  const confermaSelezione = useCallback(async () => {
    if (!daSelezionare) return
    const { file, nome, parsed, scelti } = daSelezionare
    const esito = esaminaListino({ categoria: 'sumisura', parsed }, nome, { fogliAmmessi: scelti })
    if (!esito.ok) {
      rifiuta(esito.errore)
      return
    }
    await caricaEApplica(file, nome, scelti, esito.esame)
  }, [daSelezionare, caricaEApplica, rifiuta])

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void iniziaUpload(file)
      // reset input così lo stesso file può essere ricaricato
      e.target.value = ''
    },
    [iniziaUpload]
  )

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) void iniziaUpload(file)
    },
    [iniziaUpload]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDelete = useCallback(
    async (name: string) => {
      const risposta = await chiedi({
        titolo: `Eliminare "${name}"?`,
        testo: 'Il file sparisce dal bucket dei listini e non si può recuperare.',
        azioni: [
          { valore: 'no', etichetta: 'Torna indietro', tipo: 'secondario' },
          { valore: 'si', etichetta: 'Elimina il listino', tipo: 'pericolo' },
        ],
      })
      if (risposta !== 'si') return
      setDeletingName(name)
      // `name` NON va sanitizzato: arriva dal listing del bucket, cioè da nomi
      // già passati per `sanitizeNomeFile` in upload. Sanitizzarlo qui sarebbe
      // peggio che inutile — un nome legittimo che la sanitizzazione alterasse
      // punterebbe a un oggetto inesistente e la delete fallirebbe in silenzio.
      //
      // `remove` può anche LANCIARE (storage-js rilancia ciò che non è uno
      // StorageError): il `finally` riaccende il pulsante in ogni caso (O29).
      // Errore o eccezione = stato ignoto: niente rilettura, c'è «Aggiorna».
      let rimossi: unknown[]
      try {
        const { data, error } = await supabase.storage.from(LISTINI_BUCKET).remove([name])
        if (error) {
          showToast(`Errore eliminazione: ${error.message}`, 'error')
          return
        }
        rimossi = data ?? []
      } catch (e) {
        showToast(`Errore eliminazione: ${e instanceof Error ? e.message : String(e)}`, 'error')
        return
      } finally {
        setDeletingName(null)
      }

      if (rimossi.length === 0) {
        // Nessun errore ma nulla rimosso: l'oggetto non c'era più, o l'RLS ha
        // negato la cancellazione senza dirlo. Non è «eliminato» (O29). La
        // rilettura riallinea elenco e store al bucket, qualunque sia il motivo.
        showToast(
          `Eliminazione non riuscita: "${name}" non è stato rimosso dal bucket (già eliminato o permesso mancante). Elenco aggiornato.`,
          'error'
        )
      } else {
        if (categorizzaListino(name) === 'sumisura') {
          // La selezione fogli del file, DOPO il file (speculare a
          // `caricaNelBucket`): se andasse via prima e la delete fallisse, il file
          // ancora in uso tornerebbe a «tutti i fogli». Best effort, senza
          // messaggio: un sidecar orfano è inerte e l'admin non lo vede.
          try {
            await supabase.storage.from(LISTINI_BUCKET).remove([nomeSidecar(name)])
          } catch {
            // inerte: vedi sopra
          }
        }
        showToast(`"${name}" eliminato`, 'success')
      }
      await ricaricaElenco()
      await loadDefaults()
    },
    [ricaricaElenco, loadDefaults, showToast, chiedi]
  )

  // Determina quali file sono "in uso": priorità allo state del pricelistStore
  // (verità di cosa l'app ha caricato in memoria), con fallback alla stessa
  // find()-logic del pricelistStore se lo store non è ancora popolato.
  const fallbackActiveSuMisura =
    files.find((f) => categorizzaListino(f.name) === 'sumisura')?.name ?? null
  const fallbackActiveMarmeria =
    files.find((f) => categorizzaListino(f.name) === 'marmeria')?.name ?? null
  const fallbackActivePorte =
    files.find((f) => categorizzaListino(f.name) === 'porte')?.name ?? null
  const fallbackActiveCucine =
    files.find((f) => categorizzaListino(f.name) === 'cucine')?.name ?? null
  // Una categoria che NON si è caricata (errore e niente in memoria) non ha un file
  // «In uso»: il fallback marcava «In uso» proprio il file rotto, e il banner qui
  // sotto invitava a eliminare quello buono (O8, catena con A4). Il più recente
  // della categoria si mostra «Non caricato», e nessun suo file si conta fra quelli
  // da eliminare finché la categoria non torna a caricarsi.
  const nonCaricata = {
    sumisura: erroriListini.suMisura != null && loadedSuMisuraName == null,
    marmeria: erroriListini.marmeria != null && loadedMarmeriaName == null,
    porte: erroriListini.porte != null && loadedPorteName == null,
    cucine: erroriListini.cucine != null && loadedCucineName == null,
  }
  const activeSuMisura = loadedSuMisuraName ?? (nonCaricata.sumisura ? null : fallbackActiveSuMisura)
  const activeMarmeria = loadedMarmeriaName ?? (nonCaricata.marmeria ? null : fallbackActiveMarmeria)
  const activePorte = loadedPorteName ?? (nonCaricata.porte ? null : fallbackActivePorte)
  const activeCucine = loadedCucineName ?? (nonCaricata.cucine ? null : fallbackActiveCucine)
  const isFileActive = (name: string): boolean =>
    name === activeSuMisura || name === activeMarmeria || name === activePorte || name === activeCucine
  const isNonCaricato = (name: string): boolean =>
    (nonCaricata.sumisura && name === fallbackActiveSuMisura) ||
    (nonCaricata.marmeria && name === fallbackActiveMarmeria) ||
    (nonCaricata.porte && name === fallbackActivePorte) ||
    (nonCaricata.cucine && name === fallbackActiveCucine)
  const inactiveCount = files.filter(
    (f) => !isFileActive(f.name) && !nonCaricata[categorizzaListino(f.name)]
  ).length

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1
            className="text-[28px] sm:text-[32px] text-ink-primary"
            style={{ fontFamily: '"DM Serif Display", Georgia, serif' }}
          >
            Gestione Listini
          </h1>
          <p className="text-[13px] text-ink-tertiary mt-1">
            Carica e gestisci i file Excel nel bucket Supabase{' '}
            <code className="text-[12px] bg-surface-tertiary rounded px-1.5 py-0.5">
              {LISTINI_BUCKET}
            </code>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void ricaricaElenco()}
          disabled={loading}
          className="flex items-center gap-2 rounded-sm bg-surface-secondary border border-separator-opaque px-3 py-2 text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-tertiary transition-colors duration-150 disabled:opacity-50"
          style={{ minHeight: 44 }}
          title="Aggiorna elenco"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            strokeWidth={1.5}
          />
          <span className="hidden sm:inline">Aggiorna</span>
        </button>
      </div>

      {/* Selezione fogli (solo su misura): passo intermedio prima dell'upload */}
      {daSelezionare && (
        <div className="mb-6 rounded-lg border border-brand-red/40 bg-brand-red/[0.04] p-5">
          <h3 className="text-sm font-semibold text-ink-primary">
            Quali fogli sono il listino?
          </h3>
          <p className="text-[12px] text-ink-tertiary mt-1 mb-4">
            <strong>{daSelezionare.nome}</strong> contiene {daSelezionare.fogli.length}{' '}
            {daSelezionare.fogli.length === 1 ? 'foglio' : 'fogli'}. Togli la spunta a quelli che non
            sono listini (preventivi, prove, simulazioni): le loro righe non entreranno nei prezzi.
          </p>

          <ul className="space-y-2 mb-4">
            {daSelezionare.fogli.map((f) => (
              <li key={f.nome}>
                <label className="flex items-center gap-3 text-sm text-ink-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={daSelezionare.scelti.includes(f.nome)}
                    onChange={(e) =>
                      setDaSelezionare((s) =>
                        s === null
                          ? s
                          : {
                              ...s,
                              scelti: e.target.checked
                                ? [...s.scelti, f.nome]
                                : s.scelti.filter((n) => n !== f.nome),
                            }
                      )
                    }
                  />
                  <span className="font-medium">{f.nome}</span>
                  <span className="text-[12px] text-ink-tertiary">
                    {f.voci} {f.voci === 1 ? 'voce' : 'voci'}
                    {f.combinazioni > 0 && ` · ${f.combinazioni} ${f.combinazioni === 1 ? 'combinazione' : 'combinazioni'}`}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={uploading || daSelezionare.scelti.length === 0}
              onClick={() => void confermaSelezione()}
              className="rounded-sm bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark transition-colors duration-150 disabled:opacity-50"
              style={{ minHeight: 44 }}
            >
              Carica {daSelezionare.scelti.length} di {daSelezionare.fogli.length}
            </button>
            <button
              type="button"
              onClick={() => setDaSelezionare(null)}
              className="rounded-sm px-4 py-2 text-sm text-ink-secondary hover:text-ink-primary transition-colors duration-150"
              style={{ minHeight: 44 }}
            >
              Non caricare il file
            </button>
            {daSelezionare.scelti.length === 0 && (
              <span className="text-[12px] text-error">Seleziona almeno un foglio.</span>
            )}
          </div>
        </div>
      )}

      {/* Perché l'ultimo upload non è andato. Sta QUI, sopra la dropzone, così è
          visibile in entrambi i flussi: quello a un passo (marmeria/porte) e
          quello con la selezione fogli, che sull'errore resta aperta. */}
      {esitoUpload && (
        <div
          role="alert"
          className={`mb-6 flex items-start gap-3 rounded-lg border p-4 ${
            esitoUpload.tono === 'errore'
              ? 'border-error/40 bg-error/[0.04]'
              : 'border-warning/40 bg-warning/[0.05]'
          }`}
        >
          <AlertCircle
            className={`mt-0.5 h-5 w-5 shrink-0 ${
              esitoUpload.tono === 'errore' ? 'text-error' : 'text-warning'
            }`}
            strokeWidth={1.5}
          />
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-semibold ${
                esitoUpload.tono === 'errore' ? 'text-error' : 'text-warning'
              }`}
            >
              {esitoUpload.tono === 'errore' ? 'Caricamento non riuscito' : 'Attenzione al nome del file'}
            </p>
            <p className="text-[12px] text-ink-secondary mt-1">{esitoUpload.testo}</p>
          </div>
          <button
            onClick={() => setEsitoUpload(null)}
            aria-label="Chiudi errore"
            className="shrink-0 rounded p-1 text-ink-tertiary hover:text-ink-primary hover:bg-surface-tertiary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Referto: cosa è entrato davvero, per ogni listino in memoria */}
      <RefertiPanel />

      {/* Drop zone: un <button> nativo, così Invio e Spazio li gestisce il
          browser. L'input file sta FUORI: un bottone non contiene controlli. */}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        type="button"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Scegli un file Excel da caricare"
        className={`relative flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors duration-150 mb-6
          ${
            isDragOver
              ? 'border-brand-red bg-brand-red/5'
              : 'border-separator-opaque bg-surface-secondary hover:border-ink-disabled hover:bg-surface-tertiary/50'
          }
          ${uploading ? 'pointer-events-none' : ''}
        `}
      >
        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-brand-red" strokeWidth={1.5} />
            <span className="block text-sm text-ink-secondary">Caricamento in corso...</span>
            <span className="block w-full max-w-xs h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
              <span
                className="block h-full bg-brand-red transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </span>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-ink-disabled" strokeWidth={1.5} />
            <span className="block text-center">
              <span className="block text-sm text-ink-secondary">
                Trascina un file Excel qui oppure clicca per selezionarlo
              </span>
              <span className="block text-[12px] text-ink-tertiary mt-1">
                .xlsx o .xls · massimo {MAX_SIZE_MB} MB · sovrascrive file omonimi
              </span>
            </span>
          </>
        )}
      </button>

      {/* File list */}
      <div className="rounded-lg border border-separator-opaque bg-surface-secondary overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-separator-opaque">
          <h2 className="text-sm font-semibold text-ink-primary">File nel bucket</h2>
          <span className="text-[12px] text-ink-tertiary">
            {loading ? '...' : `${files.length} file`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-ink-tertiary" strokeWidth={1.5} />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <FileSpreadsheet className="h-8 w-8 text-ink-disabled mb-2" strokeWidth={1.5} />
            <p className="text-sm text-ink-secondary">Nessun file presente nel bucket.</p>
            <p className="text-[12px] text-ink-tertiary mt-1">
              Carica il primo listino usando la zona sopra.
            </p>
          </div>
        ) : (
          <motion.ul
            variants={listContainerVariants}
            initial="hidden"
            animate="visible"
            className="divide-y divide-separator-opaque"
          >
            <AnimatePresence initial={false}>
              {files.map((file) => {
                const categoria = categorizzaListino(file.name)
                const isDeleting = deletingName === file.name
                const isActive = isFileActive(file.name)
                return (
                  <motion.li
                    key={file.name}
                    variants={listItemVariants}
                    exit="exit"
                    layout
                    className={`flex items-center gap-4 px-4 py-3 border-l-[3px] transition-colors duration-150 ${
                      isActive
                        ? 'bg-brand-red/5 border-brand-red'
                        : 'bg-surface-tertiary/40 border-transparent'
                    }`}
                  >
                    <FileSpreadsheet
                      className={`h-5 w-5 shrink-0 ${
                        isActive ? 'text-brand-red' : 'text-ink-tertiary'
                      }`}
                      strokeWidth={1.5}
                    />
                    <div className={`flex-1 min-w-0 ${!isActive ? 'opacity-65' : ''}`}>
                      <p
                        className="text-sm text-ink-primary font-medium truncate"
                        title={file.name}
                      >
                        {file.name}
                      </p>
                      <p className="text-[12px] text-ink-tertiary">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 mr-2 text-xs font-medium
                            ${
                              categoria === 'marmeria'
                                ? 'bg-brand-navy/10 text-brand-navy'
                                : categoria === 'porte' || categoria === 'cucine'
                                  ? 'bg-warning-bg text-warning'
                                  : 'bg-brand-red/10 text-brand-red'
                            }
                          `}
                        >
                          {ETICHETTA[categoria]}
                        </span>
                        {isActive ? (
                          <span className="inline-block rounded-full px-2 py-0.5 mr-2 text-xs font-medium bg-success-bg text-success">
                            In uso
                          </span>
                        ) : isNonCaricato(file.name) ? (
                          <span className="inline-block rounded-full px-2 py-0.5 mr-2 text-xs font-medium bg-error-bg text-error">
                            Non caricato
                          </span>
                        ) : (
                          <span className="inline-block rounded-full px-2 py-0.5 mr-2 text-xs font-medium bg-ink-tertiary/15 text-ink-tertiary">
                            Non attivo
                          </span>
                        )}
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatDate(file.updated_at)}
                          {file.size ? ` · ${formatSize(file.size)}` : ''}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDelete(file.name)}
                      disabled={isDeleting}
                      className="flex h-9 w-9 items-center justify-center rounded-xs text-ink-tertiary hover:text-error hover:bg-error/10 transition-colors duration-150 disabled:opacity-50"
                      aria-label={`Elimina ${file.name}`}
                      title="Elimina"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                      ) : (
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      )}
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>

      {/* Banner file non attivi — solo se ce ne sono */}
      {!loading && inactiveCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex items-start gap-2 rounded-sm bg-warning/5 border border-warning/20 px-4 py-3"
        >
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-warning" strokeWidth={1.5} />
          <p className="text-[13px] text-ink-secondary">
            {inactiveCount === 1 ? (
              <>
                C'è <strong>1 file</strong> non più utilizzato. Puoi eliminarlo per liberare
                spazio.
              </>
            ) : (
              <>
                Ci sono <strong>{inactiveCount} file</strong> non più utilizzati. Puoi
                eliminarli per liberare spazio.
              </>
            )}
          </p>
        </motion.div>
      )}

      {/* Info categorizzazione */}
      <div className="mt-4 flex items-start gap-2 rounded-sm bg-surface-tertiary px-4 py-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-ink-tertiary" strokeWidth={1.5} />
        <p className="text-[12px] text-ink-tertiary">
          I file vengono categorizzati automaticamente dal nome, in quest'ordine: contiene{' '}
          <strong>"porte"</strong> → listino Porte; contiene <strong>"marmeria"</strong> → listino
          Gres (il file del Gres si riconosce da questa parola nel nome); contiene{' '}
          <strong>"cucin"</strong> (cucina, cucine) → listino Cucine;{' '}
          <strong>qualsiasi altro nome</strong> → listino Arredi. L'ordine conta: un nome che
          contiene più di una di queste parole finisce nella prima della lista (per esempio{' '}
          <strong>"porte"</strong> e <strong>"cucina"</strong> insieme: Porte). Maiuscole
          indifferenti. Dopo ogni modifica i listini vengono ricaricati in memoria.
        </p>
      </div>
      {finestra}
    </div>
  )
}
