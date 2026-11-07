import { MotionGlobalConfig } from 'motion/react'

/**
 * In jsdom non si anima.
 *
 * Non è cosmesi: senza questo, `AnimatePresence` tiene il nodo nel DOM finché
 * l'animazione d'uscita non finisce, e quell'animazione gira su
 * requestAnimationFrame — che NON segue `vi.advanceTimersByTime`. Misurato sul
 * toast: auto-dismiss a 3500ms, e a 4000ms di orologio finto il nodo era ancora
 * lì; spariva solo dopo aver dato al loop abbastanza giri reali.
 *
 * Conseguenza: qualsiasi asserzione "è sparito" misurava l'animazione invece
 * del comportamento, e passava o falliva a seconda di quanti await c'erano
 * prima. Con le animazioni spente la rimozione è simultanea al timer (misurato:
 * 1 nodo a 3400ms, 0 a 3600ms), quindi il test dice ciò che afferma di dire.
 */
MotionGlobalConfig.skipAnimations = true

/**
 * jsdom non implementa `HTMLDialogElement.showModal` e `close` (v29): chi li
 * chiama lancia «not a function». Lo stub fa solo ciò che si può osservare qui,
 * cioè l'attributo `open`. Blocco del Tab, Esc e ritorno del focus sono del
 * browser e non si provano in jsdom (vedi `ConfermaGenera`).
 */
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
}
