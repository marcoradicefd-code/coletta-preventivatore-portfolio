import { useState, type ComponentPropsWithRef } from 'react'

type CampoNumeroProps = Omit<ComponentPropsWithRef<'input'>, 'type' | 'value'> & {
  /**
   * Il valore dello store. 0, `null`, `undefined` e un numero non finito si
   * mostrano vuoti, col segnaposto. Senza la chiave `value` il campo non è
   * controllato (react-hook-form, che lo legge dal ref).
   */
  value?: number | null
}

/**
 * Il campo numerico dell'app (L24): ogni `input type="number"` passa da qui, e
 * un test lo presidia. Tre comportamenti in un punto solo:
 *
 * 1. **Lo 0 si mostra vuoto, col segnaposto «0».** Un campo che mostrava «0»,
 *    allineato a destra, prendeva il cursore PRIMA dello zero al clic: «1200»
 *    diventava 12000 (Progetto a valore, nel video). Mentre si scrive vale il
 *    testo battuto se dice lo stesso numero dello store (lo «0» di «0,5» non
 *    sparisce, il campo svuotato resta vuoto); altrimenti il valore dello store,
 *    che è quello su cui si calcola (un tetto, un minimo). All'uscita torna il
 *    valore dello store.
 * 2. **Al focus il contenuto si seleziona tutto**: quello che si scrive
 *    sostituisce, non si attacca. Misurato in Chromium 147 e Firefox 148 col
 *    clic: `select()` nel focus regge (rimandato con `setTimeout` o
 *    `requestAnimationFrame` no).
 * 3. **La rotella sopra il campo col focus lo fa uscire dal focus.** Chrome
 *    cambia il numero di 1 a ogni scatto solo a un campo col focus, e React
 *    registra `wheel` come passivo, dove `preventDefault` è ignorato (misurato:
 *    il valore cambia lo stesso). Il `blur` arriva prima dell'azione del
 *    browser, quindi il numero resta, e la pagina continua a scorrere.
 */
export function CampoNumero(props: Readonly<CampoNumeroProps>) {
  const { value, placeholder = '0', onChange, onFocus, onBlur, onWheel, ...resto } = props
  const [testo, setTesto] = useState<string | null>(null)
  const numero = typeof value === 'number' && Number.isFinite(value) ? value : 0
  const daStore = numero === 0 ? '' : String(numero)
  const mostrato = testo !== null && (testo === '' || Number(testo) === numero) ? testo : daStore

  return (
    <input
      {...resto}
      type="number"
      placeholder={placeholder}
      {...('value' in props ? { value: mostrato } : {})}
      onChange={(e) => {
        setTesto(e.target.value)
        onChange?.(e)
      }}
      onFocus={(e) => {
        e.currentTarget.select()
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setTesto(null)
        onBlur?.(e)
      }}
      onWheel={(e) => {
        if (document.activeElement === e.currentTarget) e.currentTarget.blur()
        onWheel?.(e)
      }}
    />
  )
}
