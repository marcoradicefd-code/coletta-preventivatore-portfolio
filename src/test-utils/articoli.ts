/**
 * Un articolo su misura a pezzo, 1 × 100 €: il caso più semplice per avere
 * una sezione Arredi non vuota. Era copiato identico in quattro file di test.
 */
export const articoloPZ = {
  origine: 'manuale' as const,
  descrizione: 'Mobile',
  prezzoUnitario: 100,
  um: 'PZ' as const,
  larghezzaCm: null,
  altezzaCm: null,
  lunghezzaMl: null,
  quantita: 1,
  profonditaOltre65: false,
  finituraInterna: '',
  finituraEsterna: '',
  codiceFinitura: '',
  note: '',
}
