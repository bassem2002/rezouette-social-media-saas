#!/usr/bin/env node
/**
 * Contrôle post-connexion YouTube.
 *
 * Interroge le BACKEND ZERNIO (jamais Google) pour vérifier qu'une connexion
 * OAuth est exploitable avant un premier upload. Lecture seule : aucun refresh
 * n'est déclenché, aucune donnée n'est écrite, rien n'est stocké sur disque.
 *
 * Usage :
 *   npm run youtube:check -- --userId=00000000-0000-0000-0000-000000000001
 *   npm run youtube:check -- --userId=<uuid> --apiBaseUrl=http://localhost:3000/api/v1
 *
 * Codes de sortie :
 *   0 — connexion prête pour un premier upload privé
 *   1 — connexion inutilisable
 *   2 — utilisable, mais au moins un avertissement
 */

const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1'

/// Forme UUID 8-4-4-4-12, sans contrainte de version : cohérent avec
/// ParseUuidShapePipe côté backend, qui accepte le userId de démonstration.
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

const TOKEN_STATUSES = new Set([
  'VALID',
  'EXPIRING_SOON',
  'EXPIRED',
  'RECONNECT_REQUIRED',
])

const REQUEST_TIMEOUT_MS = 10_000

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {}
  for (const raw of argv) {
    const match = /^--([a-zA-Z][a-zA-Z0-9]*)=(.*)$/.exec(raw)
    if (match) args[match[1]] = match[2].trim()
  }
  return args
}

// ---------------------------------------------------------------------------
// Affichage — jamais de token, de scope ni de metadata interne
// ---------------------------------------------------------------------------

const lines = []
const ok = (message) => lines.push({ level: 'ok', message })
const info = (message) => lines.push({ level: 'info', message })
const warn = (message) => lines.push({ level: 'warn', message })
const fail = (message) => lines.push({ level: 'error', message })

/// Un channelId n'est pas un secret, mais il identifie une chaîne réelle : on
/// n'en affiche qu'une empreinte suffisante pour distinguer deux comptes.
function maskChannelId(value) {
  if (typeof value !== 'string' || value.length === 0) return '(inconnu)'
  if (value.length <= 6) return `${value.slice(0, 2)}…`
  return `${value.slice(0, 4)}…${value.slice(-2)}`
}

function formatExpiry(value) {
  if (value === null || value === undefined) return 'non renseignée'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'illisible'

  const minutes = Math.round((date.getTime() - Date.now()) / 60_000)
  const relative =
    minutes >= 0 ? `dans ${minutes} min` : `il y a ${Math.abs(minutes)} min`
  return `${date.toISOString()} (${relative})`
}

// ---------------------------------------------------------------------------
// Appels HTTP — backend local uniquement
// ---------------------------------------------------------------------------

async function getJson(url) {
  let response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    // fetch lève TimeoutError sur délai dépassé, TypeError sur connexion
    // refusée : on traduit plutôt que d'exposer un nom de classe.
    const cause =
      error?.name === 'TimeoutError' ? 'délai dépassé' : 'connexion refusée'
    // L'origine est utile au diagnostic et ne contient aucun paramètre.
    return {
      error: `backend injoignable (${cause}) sur ${new URL(url).origin} — le backend est-il démarré ?`,
    }
  }

  if (response.status === 503) {
    return { error: "l'intégration YouTube n'est pas configurée (503)" }
  }
  if (response.status === 404) {
    return { error: 'aucune chaîne YouTube pour cet utilisateur (404)' }
  }
  if (!response.ok) {
    return { error: `réponse HTTP ${response.status}` }
  }

  try {
    return { data: await response.json() }
  } catch {
    return { error: 'réponse illisible (JSON invalide)' }
  }
}

// ---------------------------------------------------------------------------
// Validation de contrat — une réponse inattendue est un échec, pas un détail
// ---------------------------------------------------------------------------

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateAccounts(payload) {
  if (!Array.isArray(payload)) return null
  return payload.every(
    (a) =>
      isObject(a) &&
      typeof a.id === 'string' &&
      typeof a.accountName === 'string' &&
      typeof a.needsReconnect === 'boolean',
  )
    ? payload
    : null
}

function validateStatuses(payload) {
  if (!isObject(payload) || !Array.isArray(payload.accounts)) return null
  return payload.accounts.every(
    (s) =>
      isObject(s) &&
      typeof s.accountId === 'string' &&
      typeof s.hasRefreshToken === 'boolean' &&
      typeof s.needsReconnect === 'boolean' &&
      TOKEN_STATUSES.has(s.status),
  )
    ? payload.accounts
    : null
}

// ---------------------------------------------------------------------------
// Analyse d'une chaîne
// ---------------------------------------------------------------------------

/// Renvoie 'error' | 'warn' | 'ok' pour une chaîne donnée.
function reportChannel(account, status) {
  lines.push({ level: 'title', message: account.accountName || '(sans nom)' })
  info(`   chaîne : ${maskChannelId(account.externalAccountId)}`)

  if (!status) {
    fail('   aucun statut de token renvoyé pour cette chaîne')
    return 'error'
  }

  info(`   statut : ${status.status}`)
  info(`   expiration : ${formatExpiry(status.expiresAt)}`)

  let level = 'ok'

  if (!status.hasRefreshToken) {
    // Sans refresh token, l'access token (~1 h) ne peut pas être renouvelé :
    // toute publication différée échouera. C'est bloquant.
    fail(
      '   aucun refresh token — reconnecter la chaîne (révoquer l’accès côté Google puis relancer)',
    )
    level = 'error'
  } else {
    ok('   refresh token présent')
  }

  if (status.needsReconnect || account.needsReconnect) {
    fail('   reconnexion requise (needsReconnect)')
    level = 'error'
  }

  if (status.status === 'RECONNECT_REQUIRED') {
    if (level !== 'error') fail('   statut RECONNECT_REQUIRED')
    level = 'error'
  } else if (status.status === 'EXPIRED') {
    // Expiré MAIS renouvelable : le backend sait le rafraîchir tout seul.
    if (level === 'ok') {
      warn('   access token expiré — sera renouvelé au prochain appel')
      level = 'warn'
    }
  } else if (status.status === 'EXPIRING_SOON' && level === 'ok') {
    warn('   access token proche de l’expiration — renouvellement imminent')
    level = 'warn'
  }

  if (level === 'ok') ok('   aucune reconnexion requise')
  return level
}

// ---------------------------------------------------------------------------
// Entrée
// ---------------------------------------------------------------------------

function render() {
  const icons = { ok: '✅', warn: '⚠️', error: '❌', info: 'ℹ️', title: '•' }
  console.log('YouTube connection check')
  console.log('')
  for (const { level, message } of lines) {
    console.log(`${icons[level]} ${message}`)
  }
  console.log('')
}

async function main(argv) {
  const args = parseArgs(argv)
  const userId = args.userId ?? ''
  const apiBaseUrl = (args.apiBaseUrl || DEFAULT_API_BASE_URL).replace(
    /\/+$/,
    '',
  )

  if (!UUID_SHAPE.test(userId)) {
    console.log('YouTube connection check')
    console.log('')
    console.log('❌ --userId manquant ou mal formé (UUID 8-4-4-4-12 attendu)')
    console.log('')
    console.log(
      'Usage : npm run youtube:check -- --userId=00000000-0000-0000-0000-000000000001',
    )
    return 1
  }

  const query = `userId=${encodeURIComponent(userId)}`
  const [accountsResult, statusResult] = await Promise.all([
    getJson(`${apiBaseUrl}/social/youtube/accounts?${query}`),
    getJson(`${apiBaseUrl}/social/youtube/token-status?${query}`),
  ])

  if (accountsResult.error) {
    fail(`GET /social/youtube/accounts : ${accountsResult.error}`)
    render()
    console.log('Résultat : connexion inutilisable.')
    return 1
  }
  if (statusResult.error) {
    fail(`GET /social/youtube/token-status : ${statusResult.error}`)
    render()
    console.log('Résultat : connexion inutilisable.')
    return 1
  }

  const accounts = validateAccounts(accountsResult.data)
  if (accounts === null) {
    fail('Contrat de réponse invalide sur /social/youtube/accounts')
    render()
    console.log('Résultat : connexion inutilisable.')
    return 1
  }

  const statuses = validateStatuses(statusResult.data)
  if (statuses === null) {
    fail('Contrat de réponse invalide sur /social/youtube/token-status')
    render()
    console.log('Résultat : connexion inutilisable.')
    return 1
  }

  if (accounts.length === 0) {
    fail('Aucune chaîne YouTube connectée')
    render()
    console.log('Résultat : connexion inutilisable.')
    return 1
  }

  ok(`${accounts.length} chaîne(s) trouvée(s)`)

  const byId = new Map(statuses.map((s) => [s.accountId, s]))
  const levels = accounts.map((account) =>
    reportChannel(account, byId.get(account.id)),
  )

  const orphans = statuses.filter(
    (s) => !accounts.some((a) => a.id === s.accountId),
  )
  if (orphans.length > 0) {
    warn(
      `${orphans.length} statut(s) sans chaîne correspondante — incohérence entre les deux endpoints`,
    )
    levels.push('warn')
  }

  render()

  if (levels.includes('error')) {
    console.log('Résultat : connexion inutilisable — corriger avant tout upload.')
    return 1
  }
  if (levels.includes('warn')) {
    console.log(
      'Résultat : connexion exploitable, avec des points à surveiller.',
    )
    return 2
  }
  console.log('Résultat : connexion prête pour un premier upload privé.')
  return 0
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code
})
