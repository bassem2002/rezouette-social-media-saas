import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(__dirname, 'youtube-preflight.mjs')

/// Sentinelles reconnaissables : si l'une apparaît en sortie, le script fuit
/// une valeur sensible.
const CLIENT_ID = 'SENTINEL-CLIENT-ID-9f3a'
const CLIENT_SECRET = 'SENTINEL-CLIENT-SECRET-4b21'
const STATE_SECRET = 'SENTINEL-STATE-SECRET-0123456789abcdefghij'

const GOOD_ENV: Record<string, string> = {
  YOUTUBE_CLIENT_ID: CLIENT_ID,
  YOUTUBE_CLIENT_SECRET: CLIENT_SECRET,
  OAUTH_STATE_SECRET: STATE_SECRET,
  YOUTUBE_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/youtube/callback',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:4200',
  YOUTUBE_PUBLISHING_ENABLED: 'false',
}

interface Run {
  code: number
  stdout: string
}

function exec(args: string[], env: NodeJS.ProcessEnv): Run {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      env,
      encoding: 'utf8',
    })
    return { code: 0, stdout }
  } catch (error) {
    const err = error as { status?: number; stdout?: string }
    return { code: err.status ?? -1, stdout: err.stdout ?? '' }
  }
}

/// `--no-env-file` garantit que le `.env` réel du poste n'influence pas le test.
function run(overrides: Record<string, string> = {}): Run {
  return exec(['--no-env-file'], { ...process.env, ...GOOD_ENV, ...overrides })
}

/// Exécute le script contre un fichier `.env` de test, dans un environnement
/// débarrassé des clés auditées : c'est bien le FICHIER qui décide.
function runWithEnvFile(content: string): Run {
  const dir = mkdtempSync(join(tmpdir(), 'zernio-preflight-'))
  const file = join(dir, '.env')
  writeFileSync(file, content, 'utf8')

  const env = { ...process.env }
  for (const key of Object.keys(GOOD_ENV)) delete env[key]

  try {
    return exec([`--env-file=${file}`], env)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('youtube-preflight — configuration complète', () => {
  it('sort en 0 quand tout est cohérent', () => {
    const { code, stdout } = run()

    expect(code).toBe(0)
    expect(stdout).toContain('Client ID configuré')
    expect(stdout).toContain('Client secret configuré')
    expect(stdout).toContain('Secret OAuth configuré')
    expect(stdout).toContain('Redirect URI cohérente')
    expect(stdout).toContain('Frontend Angular : http://localhost:4200')
    expect(stdout).toContain('Publication désactivée pour le test OAuth')
    expect(stdout).toContain('prêt pour un premier flux OAuth')
  })

  it('accepte une origine ngrok HTTPS sans la rendre obligatoire', () => {
    const { code } = run({
      YOUTUBE_REDIRECT_URI:
        'https://a1b2.ngrok-free.app/api/v1/auth/youtube/callback',
      PUBLIC_BASE_URL: 'https://a1b2.ngrok-free.app',
    })

    expect(code).toBe(0)
  })
})

/// Régression : le chargeur retenait la PREMIÈRE occurrence d'une clé, alors
/// que dotenv — donc le backend — retient la DERNIÈRE. Le préflight validait
/// ainsi des credentials que l'application ne voyait pas.
describe('youtube-preflight — clés dupliquées (règle dotenv)', () => {
  const BASE = [
    'YOUTUBE_CLIENT_ID=premier',
    'YOUTUBE_CLIENT_SECRET=premier',
    'OAUTH_STATE_SECRET=0123456789abcdefghij0123456789abcdefghij',
    'YOUTUBE_REDIRECT_URI=http://localhost:3000/api/v1/auth/youtube/callback',
    'PUBLIC_BASE_URL=http://localhost:3000',
    'FRONTEND_URL=http://localhost:4200',
    'YOUTUBE_PUBLISHING_ENABLED=false',
  ].join('\n')

  it('retient la dernière occurrence, pas la première', () => {
    // La 2e occurrence vide les credentials : le script doit le voir.
    const { code, stdout } = runWithEnvFile(
      `${BASE}\nYOUTUBE_CLIENT_ID=\nYOUTUBE_CLIENT_SECRET=\n`,
    )

    expect(code).toBe(1)
    expect(stdout).toContain('Client ID manquant')
    expect(stdout).toContain('Client secret manquant')
  })

  it('retient une dernière occurrence non vide qui succède à une vide', () => {
    const { code, stdout } = runWithEnvFile(
      'YOUTUBE_CLIENT_ID=\nYOUTUBE_CLIENT_SECRET=\n' +
        `${BASE}\n`.replace('YOUTUBE_CLIENT_ID=premier', 'YOUTUBE_CLIENT_ID=final'),
    )

    expect(code).toBe(0)
    expect(stdout).toContain('Client ID configuré')
  })

  it.each<[string, string, string]>([
    [
      'PUBLIC_BASE_URL',
      'PUBLIC_BASE_URL=https://premier.ngrok-free.app',
      'https://premier.ngrok-free.app',
    ],
    ['FRONTEND_URL', 'FRONTEND_URL=http://localhost:5173', '5173'],
  ])(
    'retient la dernière valeur de %s sur une clé non sensible',
    (_key, extra, absent) => {
      // `extra` est placé APRÈS : sa valeur doit l'emporter…
      const last = runWithEnvFile(`${BASE}\n${extra}\n`)
      expect(last.stdout).toContain(absent)

      // …et placé AVANT, elle doit être ignorée.
      const first = runWithEnvFile(`${extra}\n${BASE}\n`)
      expect(first.stdout).not.toContain(absent)
    },
  )

  it('laisse une vraie variable d’environnement primer sur le fichier', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zernio-preflight-'))
    const file = join(dir, '.env')
    writeFileSync(file, `${BASE}\nYOUTUBE_CLIENT_ID=\n`, 'utf8')

    try {
      const { code, stdout } = exec([`--env-file=${file}`], {
        ...process.env,
        ...GOOD_ENV, // YOUTUBE_CLIENT_ID est défini ici, non vide
      })

      expect(code).toBe(0)
      expect(stdout).toContain('Client ID configuré')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ignore un BOM en tête de fichier', () => {
    const { code, stdout } = runWithEnvFile(`﻿${BASE}\n`)

    expect(code).toBe(0)
    expect(stdout).toContain('Client ID configuré')
  })

  it('ignore les lignes de commentaire et les lignes vides', () => {
    const { code } = runWithEnvFile(
      `# commentaire\n\n${BASE}\n\n# YOUTUBE_CLIENT_ID=commente\n`,
    )

    expect(code).toBe(0)
  })
})

describe('youtube-preflight — hygiène des secrets', () => {
  it.each([CLIENT_ID, CLIENT_SECRET, STATE_SECRET])(
    "n'affiche jamais la valeur %p",
    (secret) => {
      expect(run().stdout).not.toContain(secret)
    },
  )

  it('ne fuit pas un secret même quand il est signalé comme trop court', () => {
    const { code, stdout } = run({ OAUTH_STATE_SECRET: 'court' })

    expect(code).toBe(2)
    expect(stdout).toContain('Secret OAuth court')
    expect(stdout).not.toContain('court —') // pas d'écho de la valeur
    expect(stdout).not.toMatch(/OAUTH_STATE_SECRET\s*=/)
  })

  it("n'affiche ni query ni fragment d'une redirect URI", () => {
    const { stdout } = run({
      YOUTUBE_REDIRECT_URI:
        'http://localhost:3000/api/v1/auth/youtube/callback?token=LEAKQUERY#LEAKFRAGMENT',
    })

    expect(stdout).not.toContain('LEAKQUERY')
    expect(stdout).not.toContain('LEAKFRAGMENT')
  })
})

describe('youtube-preflight — erreurs bloquantes (code 1)', () => {
  it.each([
    ['YOUTUBE_CLIENT_ID', 'Client ID manquant'],
    ['YOUTUBE_CLIENT_SECRET', 'Client secret manquant'],
    ['OAUTH_STATE_SECRET', 'Secret OAuth manquant'],
    ['YOUTUBE_REDIRECT_URI', 'Redirect URI manquante'],
  ])('échoue si %s est vide', (key, expected) => {
    const { code, stdout } = run({ [key]: '' })

    expect(code).toBe(1)
    expect(stdout).toContain(expected)
  })

  it('échoue si la redirect URI ne vise pas la route de callback', () => {
    const { code, stdout } = run({
      YOUTUBE_REDIRECT_URI: 'http://localhost:3000/auth/youtube/callback',
    })

    expect(code).toBe(1)
    expect(stdout).toContain('/api/v1/auth/youtube/callback')
  })

  it.each(['pas-une-url', 'ftp://localhost/api/v1/auth/youtube/callback'])(
    'échoue si la redirect URI est inexploitable (%p)',
    (value) => {
      expect(run({ YOUTUBE_REDIRECT_URI: value }).code).toBe(1)
    },
  )

  it('échoue si la redirect URI porte un query', () => {
    const { code, stdout } = run({
      YOUTUBE_REDIRECT_URI:
        'http://localhost:3000/api/v1/auth/youtube/callback?x=1',
    })

    expect(code).toBe(1)
    expect(stdout).toContain('sans paramètre')
  })

  it('échoue si PUBLIC_BASE_URL est invalide', () => {
    expect(run({ PUBLIC_BASE_URL: 'pas-une-url' }).code).toBe(1)
  })
})

describe('youtube-preflight — avertissements (code 2)', () => {
  it('avertit si la publication est déjà activée', () => {
    const { code, stdout } = run({ YOUTUBE_PUBLISHING_ENABLED: 'true' })

    expect(code).toBe(2)
    expect(stdout).toContain('le mettre à false pour le premier test OAuth')
  })

  it.each(['1', 'yes', 'on', 'TRUE'])(
    'reconnaît %p comme publication activée',
    (value) => {
      expect(run({ YOUTUBE_PUBLISHING_ENABLED: value }).code).toBe(2)
    },
  )

  it.each(['false', 'FALSE', '0', 'no', 'nimporte-quoi', ''])(
    'traite %p comme publication désactivée',
    (value) => {
      expect(run({ YOUTUBE_PUBLISHING_ENABLED: value }).code).toBe(0)
    },
  )

  it('avertit si le frontend ne sert pas sur le port Angular', () => {
    const { code, stdout } = run({ FRONTEND_URL: 'http://localhost:5173' })

    expect(code).toBe(2)
    expect(stdout).toContain('port 4200')
  })

  it('avertit si FRONTEND_URL est invalide, sans bloquer OAuth', () => {
    const { code, stdout } = run({ FRONTEND_URL: 'pas-une-url' })

    expect(code).toBe(2)
    expect(stdout).toContain('redirection OAuth sera désactivée')
  })

  it('avertit si FRONTEND_URL est absente', () => {
    const { code, stdout } = run({ FRONTEND_URL: '' })

    expect(code).toBe(2)
    expect(stdout).toContain('FRONTEND_URL absente')
  })

  it('avertit si PUBLIC_BASE_URL est absente', () => {
    const { code, stdout } = run({ PUBLIC_BASE_URL: '' })

    expect(code).toBe(2)
    expect(stdout).toContain('PUBLIC_BASE_URL absente')
  })

  it("avertit si les origines de la redirect URI et de la base publique divergent", () => {
    const { code, stdout } = run({
      PUBLIC_BASE_URL: 'https://autre.example',
    })

    expect(code).toBe(2)
    expect(stdout).toContain('Origines différentes')
  })

  it('priorise une erreur sur un avertissement', () => {
    expect(
      run({ YOUTUBE_CLIENT_ID: '', YOUTUBE_PUBLISHING_ENABLED: 'true' }).code,
    ).toBe(1)
  })
})
