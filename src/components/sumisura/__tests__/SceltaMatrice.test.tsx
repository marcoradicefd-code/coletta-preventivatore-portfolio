import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SceltaMatrice } from '@/components/sumisura/SceltaMatrice'
import type { RigaMatrice } from '@/types/sumisura'

// C7 (revisione L15-L21): un elemento salvato prima della correzione, su un tipo
// misto, ha `interno: ''` e l'esterno della riga generica. Riaperto, l'esterno
// deve comparire scelto e modificabile. Prezzi finti.
const riga = (tipo: string, interno: string, esterno: string, prezzo: number): RigaMatrice => ({ tipo, interno, esterno, prezzo, unita: 'MQ', cella: 'FINITURE!A1' })
const MISTA = [riga('BOISERIE', 'LAMINATO BIANCO', 'LACCATO OPACO', 431), riga('BOISERIE', '', 'ROVERE', 389)]

afterEach(() => cleanup())

describe('SceltaMatrice — riapertura di «qualsiasi interno» su un tipo misto (C7)', () => {
  it('interno vuoto salvato: l’esterno resta scelto e la tendina è attiva', () => {
    render(<SceltaMatrice matrice={MISTA} value={{ tipo: 'BOISERIE', interno: '', esterno: 'ROVERE' }} onChange={() => {}} />)
    const esterno = screen.getByLabelText('Esterno') as HTMLSelectElement
    expect(esterno.value).toBe('ROVERE')
    expect(esterno.disabled).toBe(false)
  })
})
