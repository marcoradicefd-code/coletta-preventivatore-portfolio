import { test, expect } from '@playwright/test'

/**
 * Smoke test end-to-end del flusso di autenticazione.
 * Tutti i test sono hermetici: validano comportamento client-side senza
 * toccare la rete Supabase (a parte il primo caricamento della sessione,
 * che per un utente anonimo restituisce subito `null`).
 */

test.describe('AuthGuard + LoginPage', () => {
  test.beforeEach(async ({ page }) => {
    // Stato pulito ad ogni test — elimina eventuali sessioni Supabase
    // persistite in localStorage da run precedenti.
    await page.addInitScript(() => {
      try {
        window.localStorage.clear()
      } catch {
        /* noop */
      }
    })
    await page.goto('/')
  })

  test('mostra la LoginPage quando non autenticato', async ({ page }) => {
    // Il titolo brand e il sottotitolo devono essere visibili
    await expect(page.getByRole('heading', { name: 'Coletta Ebanisteria' })).toBeVisible()
    await expect(page.getByText('Preventivatore', { exact: true })).toBeVisible()

    // Tab Accedi di default (prima occorrenza: la tab, non il submit)
    await expect(
      page.getByRole('button', { name: 'Accedi', exact: true }).first()
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Registrati', exact: true }).first()
    ).toBeVisible()

    // Footer corretto in modalità login
    await expect(
      page.getByText('Accesso riservato al personale Coletta Ebanisteria.')
    ).toBeVisible()
  })

  test('cambio tab Accedi ↔ Registrati', async ({ page }) => {
    // All'inizio NON c'è conferma password
    await expect(page.getByPlaceholder('Ripeti la password')).toHaveCount(0)

    // Passa a Registrati
    await page.getByRole('button', { name: 'Registrati', exact: true }).click()

    // Ora compare il campo conferma password
    await expect(page.getByPlaceholder('Ripeti la password')).toBeVisible()

    // Il footer non cambia e non nomina i domini (L26)
    await expect(
      page.getByText('Accesso riservato al personale Coletta Ebanisteria.')
    ).toBeVisible()
    await expect(page.getByText(/@colettaebanisteria\.it|luxuryacademy/)).toHaveCount(0)

    // Torna ad Accedi
    await page.getByRole('button', { name: 'Accedi', exact: true }).click()
    await expect(page.getByPlaceholder('Ripeti la password')).toHaveCount(0)
  })

  test('registrazione con dominio non consentito → lo stesso avviso di una registrazione inviata', async ({ page }) => {
    await page.getByRole('button', { name: 'Registrati', exact: true }).click()

    await page.getByLabel('Email').fill('qualcuno@example.test')
    await page.getByPlaceholder('Minimo 10 caratteri').fill('password123')
    await page.getByPlaceholder('Ripeti la password').fill('password123')

    await page.getByRole('button', { name: 'Registrati', exact: true }).nth(1).click()

    // L26: non dice che il dominio non è ammesso, e non è un errore rosso.
    await expect(page.getByRole('status')).toContainText("Se l'indirizzo è abilitato")
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('registrazione con password troppo corta → pulsante spento col motivo (L29)', async ({ page }) => {
    await page.getByRole('button', { name: 'Registrati', exact: true }).click()

    await page
      .getByLabel('Email')
      .fill('test@colettaebanisteria.it')
    await page.getByPlaceholder('Minimo 10 caratteri').fill('abc')
    await page.getByPlaceholder('Ripeti la password').fill('abc')

    await expect(page.getByRole('button', { name: 'Registrati', exact: true }).nth(1)).toBeDisabled()
    await expect(page.getByText('Per registrarti manca: almeno 10 caratteri; almeno una lettera e una cifra.')).toBeVisible()
    await expect(page.getByRole('meter', { name: 'Robustezza della password' })).toHaveAttribute('aria-valuetext', 'Molto debole')
  })

  test('registrazione con password non coincidenti → errore', async ({ page }) => {
    await page.getByRole('button', { name: 'Registrati', exact: true }).click()

    await page
      .getByLabel('Email')
      .fill('test@luxuryacademy.online')
    await page.getByPlaceholder('Minimo 10 caratteri').fill('password123')
    await page.getByPlaceholder('Ripeti la password').fill('password999')

    await page.getByRole('button', { name: 'Registrati', exact: true }).nth(1).click()

    await expect(page.getByRole('alert')).toContainText('Le password non corrispondono.')
  })

  test('submit vuoto → "Compila tutti i campi"', async ({ page }) => {
    // Bottone submit Accedi (è l'unico di tipo submit nel form)
    await page.locator('button[type="submit"]').click()
    await expect(page.getByRole('alert')).toContainText('Compila tutti i campi.')
  })

  test('toggle visibilità password', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('••••••••')
    await passwordInput.fill('segreto123')

    await expect(passwordInput).toHaveAttribute('type', 'password')

    await page.getByRole('button', { name: 'Mostra password' }).click()
    await expect(passwordInput).toHaveAttribute('type', 'text')

    await page.getByRole('button', { name: 'Nascondi password' }).click()
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('AppShell NON è montato fino all\'autenticazione', async ({ page }) => {
    // La sidebar con i tab operativi non deve essere visibile
    await expect(page.getByRole('button', { name: 'Su Misura' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Marmeria' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Esci' })).toHaveCount(0)
  })
})
