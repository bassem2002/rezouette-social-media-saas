#!/usr/bin/env node
/**
 * Préflight de validation réelle YouTube.
 *
 * Vérifie la PRÉSENCE et la COHÉRENCE des variables d'environnement avant de
 * lancer un premier flux OAuth Google. N'effectue AUCUN appel réseau — ni vers
 * Google, ni vers le backend — et n'affiche JAMAIS la valeur d'un secret.
 *
 * Usage :
 *   npm run youtube:preflight
 *   node scripts/youtube-preflight.mjs --no-env-file
 *   node scripts/youtube-preflight.mjs --env-file=/chemin/vers/.env
 *
 * Codes de sortie :
 *   0 — prêt pour un premier flux OAuth
 *   1 — au moins une erreur bloque OAuth
 *   2 — OAuth possible, mais au moins un avertissement
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV_FILE = resolve(HERE, '..', '.env')

/// Chemin EXACT attendu du callback : `api/v1` (préfixe global) + la route du
/// YouTubeAuthController. Toute autre valeur sera rejetée par Google.
const EXPECTED_CALLBACK_PATH = '/api/v1/auth/youtube/callback'

/// Port d'`ng serve`. Voir DEFAULT_FRONTEND_BASE_URL dans src/config.
const EXPECTED_FRONTEND_PORT = '4200'

/// Longueur en deçà de laquelle un secret HMAC est jugé trop court.
/// `openssl rand -base64 32` produit 44 caractères.
const MIN_STATE_SECRET_LENGTH = 32

// ---------------------------------------------------------------------------
// Chargement .env — sans dépendance, et calqué sur dotenv (que le backend
// charge via `import 'dotenv/config'` et `ConfigModule.forRoot`) :
//
//   1. le fichier est parsé ENTIÈREMENT dans un objet, donc en cas de clé
//      dupliquée la DERNIÈRE occurrence écrase les précédentes
//      (dotenv/lib/main.js : `obj[key] = value` dans la boucle de parsing) ;
//   2. l'objet n'est appliqué à process.env que pour les clés ABSENTES, une
//      vraie variable d'environnement restant prioritaire sur le fichier.
//
// Confondre ces deux règles ferait auditer une valeur différente de celle que
// le backend utilise réellement.
// ---------------------------------------------------------------------------

/// Parse un contenu `.env` en objet. Dernière occurrence gagnante.
function parseEnv(raw) {
  const parsed = {}

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue

    const key = trimmed.slice(0, eq).trim()

    let value = trimmed.slice(eq + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }

  return parsed
}

function loadEnvFile(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return // pas de .env : on travaille avec le seul process.env
  }

  // Un BOM en tête ferait porter la marque sur le nom de la première clé.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)

  for (const [key, value] of Object.entries(parseEnv(raw))) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue
    process.env[key] = value
  }
}

/// `--env-file=<chemin>` permet de viser un autre fichier (tests, CI).
function resolveEnvFile(argv) {
  const flag = argv.find((a) => a.startsWith('--env-file='))
  return flag ? flag.slice('--env-file='.length) : ENV_FILE
}

// ---------------------------------------------------------------------------
// Collecte des constats
// ---------------------------------------------------------------------------

const findings = []
const ok = (message) => findings.push({ level: 'ok', message })
const warn = (message) => findings.push({ level: 'warn', message })
const fail = (message) => findings.push({ level: 'error', message })

/// Valeur brute d'une variable, normalisée : `''` signifie « non renseignée ».
function read(key) {
  return (process.env[key] ?? '').trim()
}

/// Parse une URL http(s). Renvoie `null` si inexploitable.
function parseHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/// Affichage SÛR d'une URL : origine + chemin uniquement. Query et fragment
/// sont retirés — ils peuvent transporter un identifiant ou un jeton.
function safeUrl(url) {
  return `${url.origin}${url.pathname}`
}

// ---------------------------------------------------------------------------
// Contrôles
// ---------------------------------------------------------------------------

/// Secret présent ? On ne révèle ni la valeur, ni sa longueur exacte, ni un
/// préfixe : uniquement le fait qu'il soit renseigné.
function checkSecret(key, label) {
  if (!read(key)) {
    fail(`${label} manquant (${key})`)
    return false
  }
  ok(`${label} configuré`)
  return true
}

function checkStateSecret() {
  if (!checkSecret('OAUTH_STATE_SECRET', 'Secret OAuth')) return
  if (read('OAUTH_STATE_SECRET').length < MIN_STATE_SECRET_LENGTH) {
    warn(
      `Secret OAuth court (< ${MIN_STATE_SECRET_LENGTH} caractères) — générer : openssl rand -base64 32`,
    )
  }
}

/// Renvoie l'URL de redirection si elle est exploitable, sinon `null`.
function checkRedirectUri() {
  const raw = read('YOUTUBE_REDIRECT_URI')
  if (!raw) {
    fail('Redirect URI manquante (YOUTUBE_REDIRECT_URI)')
    return null
  }

  const url = parseHttpUrl(raw)
  if (!url) {
    fail('Redirect URI invalide (YOUTUBE_REDIRECT_URI) — attendu http(s)://…')
    return null
  }

  if (url.search || url.hash) {
    fail(
      'Redirect URI avec query ou fragment — Google exige une URI exacte, sans paramètre',
    )
    return null
  }

  if (url.pathname !== EXPECTED_CALLBACK_PATH) {
    fail(
      `Redirect URI : chemin attendu ${EXPECTED_CALLBACK_PATH}, trouvé ${url.pathname}`,
    )
    return null
  }

  ok(`Redirect URI cohérente (${safeUrl(url)})`)
  return url
}

/// `PUBLIC_BASE_URL` accepte localhost comme une URL publique (ngrok, domaine).
/// Elle est facultative : absente, le code retombe sur http://localhost:PORT.
function checkPublicBaseUrl() {
  const raw = read('PUBLIC_BASE_URL')
  if (!raw) {
    warn(
      'PUBLIC_BASE_URL absente — repli sur http://localhost:PORT (suffisant pour un test OAuth local)',
    )
    return null
  }

  const url = parseHttpUrl(raw)
  if (!url) {
    fail('PUBLIC_BASE_URL invalide — attendu http(s)://…')
    return null
  }

  ok(`Base publique : ${url.origin}`)
  return url
}

/// Un écart d'origine n'empêche pas OAuth (Google ne connaît que la redirect
/// URI) mais trahit presque toujours une configuration à moitié migrée.
function checkOriginsMatch(redirectUrl, publicUrl) {
  if (!redirectUrl || !publicUrl) return
  if (redirectUrl.origin === publicUrl.origin) {
    ok('Origines cohérentes entre redirect URI et base publique')
    return
  }
  warn(
    `Origines différentes : redirect URI sur ${redirectUrl.origin}, base publique sur ${publicUrl.origin}`,
  )
}

/// Une origine frontend inexploitable ne bloque pas OAuth : le callback retombe
/// sur une réponse JSON. C'est donc un avertissement, pas une erreur.
function checkFrontendUrl() {
  const raw = read('FRONTEND_URL')
  if (!raw) {
    warn(
      `FRONTEND_URL absente — repli sur http://localhost:${EXPECTED_FRONTEND_PORT}`,
    )
    return
  }

  const url = parseHttpUrl(raw)
  if (!url) {
    warn(
      'FRONTEND_URL invalide — la redirection OAuth sera désactivée (repli sur une réponse JSON)',
    )
    return
  }

  if (url.port !== EXPECTED_FRONTEND_PORT) {
    warn(
      `FRONTEND_URL sur ${url.origin} — le frontend Angular sert par défaut sur le port ${EXPECTED_FRONTEND_PORT}`,
    )
    return
  }

  ok(`Frontend Angular : ${url.origin}`)
}

/// Le premier test doit valider la CONNEXION seule. La publication s'active
/// ensuite, dans une étape distincte et réversible.
function checkPublishingDisabled() {
  const raw = read('YOUTUBE_PUBLISHING_ENABLED').toLowerCase()
  const enabled = ['true', '1', 'yes', 'on'].includes(raw)

  if (enabled) {
    warn(
      'YOUTUBE_PUBLISHING_ENABLED est actif — le mettre à false pour le premier test OAuth',
    )
    return
  }
  ok('Publication désactivée pour le test OAuth')
}

// ---------------------------------------------------------------------------
// Entrée
// ---------------------------------------------------------------------------

function main(argv) {
  if (!argv.includes('--no-env-file')) loadEnvFile(resolveEnvFile(argv))

  checkSecret('YOUTUBE_CLIENT_ID', 'Client ID')
  checkSecret('YOUTUBE_CLIENT_SECRET', 'Client secret')
  checkStateSecret()

  const redirectUrl = checkRedirectUri()
  const publicUrl = checkPublicBaseUrl()
  checkOriginsMatch(redirectUrl, publicUrl)

  checkFrontendUrl()
  checkPublishingDisabled()

  const errors = findings.filter((f) => f.level === 'error')
  const warnings = findings.filter((f) => f.level === 'warn')

  const icons = { ok: '✅', warn: '⚠️', error: '❌' }
  console.log('YouTube preflight')
  for (const { level, message } of findings) {
    console.log(`${icons[level]} ${message}`)
  }
  console.log('')

  if (errors.length > 0) {
    console.log(
      `Résultat : ${errors.length} erreur(s) — le flux OAuth ne peut pas aboutir.`,
    )
    return 1
  }
  if (warnings.length > 0) {
    console.log(
      `Résultat : prêt pour OAuth, avec ${warnings.length} avertissement(s) à lever.`,
    )
    return 2
  }
  console.log('Résultat : prêt pour un premier flux OAuth.')
  return 0
}

process.exitCode = main(process.argv.slice(2))
