/**
 * Un UUID v4, per gli id che nascono nel browser (righe del preventivo, id di
 * una riga del database generato prima della scrittura).
 *
 * `crypto.randomUUID` c'è solo in un contesto sicuro (HTTPS o localhost) e da
 * Safari 15.4: altrove non è una funzione e chi lo chiama lancia (revisione del
 * 14/10 sulla #97, difetto 11). Lì l'UUID si compone da
 * `crypto.getRandomValues`, che c'è in ogni contesto: 16 byte casuali con
 * versione (4) e variante (10) al loro posto, come RFC 9562 § 5.4. Mai
 * `Math.random`: è un identificativo che non deve collidere. Senza nemmeno
 * `getRandomValues` lancia, e il chiamante lo dice.
 */
export function nuovoUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
