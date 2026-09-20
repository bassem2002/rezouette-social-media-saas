import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { resolve } from 'node:path'

const SCRIPT = resolve(__dirname, 'check-youtube-connection.mjs')
const USER_ID = '00000000-0000-0000-0000-000000000001'

/// Réponse canned par route. `status` permet de simuler 503/404/500.
interface Canned {
  status?: number
  body?: unknown
  raw?: string
}

let accountsResponse: Canned
let statusResponse: Canned
let server: Server
let baseUrl: string

/// Serveur LOCAL de test : le script ne doit jamais joindre autre chose.
beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0]
    const canned = path.endsWith('/social/youtube/accounts')
      ? accountsResponse
      : path.endsWith('/social/youtube/token-status')
        ? statusResponse
        : { status: 404, body: {} }

    res.writeHead(canned.status ?? 200, { 'content-type': 'application/json' })
    res.end(canned.raw ?? JSON.stringify(canned.body ?? null))
  })

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}/api/v1`
})

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()))
})

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    externalAccountId: 'UC_abcdefghijklmnop',
    accountName: 'Ma chaîne',
    platform: 'youtube',
    status: 'ACTIVE',
    needsReconnect: false,
    tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    scopes: ['https://www.googleapis.com/auth/youtube.upload'],
    metadata: { customUrl: '@machaine' },
    ...overrides,
  }
}

function status(overrides: Record<string, unknown> = {}) {
  return {
    accountId: 'acc-1',
    channelId: 'UC_abcdefghijklmnop',
    accountName: 'Ma chaîne',
    status: 'VALID',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    needsReconnect: false,
    hasRefreshToken: true,
    ...overrides,
  }
}

interface Run {
  code: number
  stdout: string
}

/// ASYNCHRONE, impérativement : le serveur de test tourne dans CE process.
/// Un `execFileSync` bloquerait la boucle d'événements et aucune requête ne
/// serait servie — le script conclurait à tort « backend injoignable ».
function exec(args: string[]): Promise<Run> {
  return new Promise((done) => {
    execFile(
      process.execPath,
      [SCRIPT, ...args],
      { encoding: 'utf8' },
      (error, stdout) => {
        const code = error ? ((error as { code?: number }).code ?? -1) : 0
        done({ code, stdout })
      },
    )
  })
}

function run(args: string[] = [`--userId=${USER_ID}`]): Promise<Run> {
  return exec([...args, `--apiBaseUrl=${baseUrl}`])
}

beforeEach(() => {
  accountsResponse = { body: [account()] }
  statusResponse = { body: { accounts: [status()] } }
})

describe('check-youtube-connection — connexion saine', () => {
  it('sort en 0 et résume la chaîne', async () => {
    const { code, stdout } = await run()

    expect(code).toBe(0)
    expect(stdout).toContain('1 chaîne(s) trouvée(s)')
    expect(stdout).toContain('Ma chaîne')
    expect(stdout).toContain('refresh token présent')
    expect(stdout).toContain('aucune reconnexion requise')
    expect(stdout).toContain('prête pour un premier upload privé')
  })

  it('croise comptes et statuts par accountId', async () => {
    accountsResponse = {
      body: [
        account({ id: 'a', accountName: 'Chaîne A' }),
        account({ id: 'b', accountName: 'Chaîne B' }),
      ],
    }
    statusResponse = {
      body: {
        // Ordre inversé : l'appariement doit se faire par id, pas par position.
        accounts: [
          status({ accountId: 'b', hasRefreshToken: true }),
          status({ accountId: 'a', hasRefreshToken: true }),
        ],
      },
    }

    const { code, stdout } = await run()

    expect(code).toBe(0)
    expect(stdout).toContain('2 chaîne(s) trouvée(s)')
    expect(stdout).toContain('Chaîne A')
    expect(stdout).toContain('Chaîne B')
  })
})

describe('check-youtube-connection — hygiène de sortie', () => {
  it("n'affiche ni scope, ni metadata, ni channelId complet", async () => {
    const { stdout } = await run()

    expect(stdout).not.toContain('youtube.upload')
    expect(stdout).not.toContain('@machaine')
    expect(stdout).not.toContain('UC_abcdefghijklmnop')
    expect(stdout).toContain('UC_a…op')
  })

  it("n'affiche rien de brut si le backend renvoie un champ inattendu", async () => {
    accountsResponse = {
      body: [account({ accessToken: 'ya29.SECRET', refreshToken: '1//SECRET' })],
    }

    const { stdout } = await run()

    expect(stdout).not.toContain('ya29.SECRET')
    expect(stdout).not.toContain('1//SECRET')
  })
})

describe('check-youtube-connection — validation du userId', () => {
  it.each([
    ['argument absent', []],
    ['valeur vide', ['--userId=']],
    ['pas un uuid', ['--userId=pas-un-uuid']],
    ['trop court', ['--userId=1234']],
    ['segments mal dimensionnés', ['--userId=0000-0000-0000-0000-0000']],
  ])('refuse un userId %s', async (_label, args) => {
    const { code, stdout } = await run(args as string[])

    expect(code).toBe(1)
    expect(stdout).toContain('--userId manquant ou mal formé')
  })

  it('accepte le userId de démonstration (version non conforme RFC)', async () => {
    expect((await run([`--userId=${USER_ID}`])).code).toBe(0)
  })
})

describe('check-youtube-connection — cas bloquants (code 1)', () => {
  it('échoue si aucune chaîne', async () => {
    accountsResponse = { body: [] }

    const { code, stdout } = await run()

    expect(code).toBe(1)
    expect(stdout).toContain('Aucune chaîne YouTube connectée')
  })

  it('échoue sur 503 (intégration non configurée)', async () => {
    accountsResponse = { status: 503, body: { message: 'not configured' } }

    const { code, stdout } = await run()

    expect(code).toBe(1)
    expect(stdout).toContain("n'est pas configurée (503)")
  })

  it('échoue sur 404', async () => {
    statusResponse = { status: 404, body: {} }

    expect((await run()).code).toBe(1)
  })

  it('échoue sur une 500', async () => {
    accountsResponse = { status: 500, body: {} }

    const { code, stdout } = await run()

    expect(code).toBe(1)
    expect(stdout).toContain('réponse HTTP 500')
  })

  it('échoue si hasRefreshToken est faux', async () => {
    statusResponse = { body: { accounts: [status({ hasRefreshToken: false })] } }

    const { code, stdout } = await run()

    expect(code).toBe(1)
    expect(stdout).toContain('aucun refresh token')
  })

  it('échoue si needsReconnect est vrai', async () => {
    statusResponse = { body: { accounts: [status({ needsReconnect: true })] } }

    const { code, stdout } = await run()

    expect(code).toBe(1)
    expect(stdout).toContain('reconnexion requise')
  })

  it('échoue si le compte porte needsReconnect sans le statut', async () => {
    accountsResponse = { body: [account({ needsReconnect: true })] }

    expect((await run()).code).toBe(1)
  })

  it('échoue sur le statut RECONNECT_REQUIRED', async () => {
    statusResponse = {
      body: { accounts: [status({ status: 'RECONNECT_REQUIRED' })] },
    }

    expect((await run()).code).toBe(1)
  })

  it('échoue si une chaîne n’a aucun statut', async () => {
    statusResponse = { body: { accounts: [] } }

    const { code, stdout } = await run()

    expect(code).toBe(1)
    expect(stdout).toContain('aucun statut de token renvoyé')
  })

  it.each([
    ['accounts non tableau', { body: { oops: true } }],
    ['élément sans id', { body: [{ accountName: 'x' }] }],
    ['JSON illisible', { raw: 'not json' }],
  ])('échoue sur un contrat /accounts invalide (%s)', async (_label, canned) => {
    accountsResponse = canned as Canned

    expect((await run()).code).toBe(1)
  })

  it.each([
    ['enveloppe absente', { body: [] }],
    ['statut inconnu', { body: { accounts: [status({ status: 'WEIRD' })] } }],
    [
      'hasRefreshToken non booléen',
      { body: { accounts: [status({ hasRefreshToken: 'oui' })] } },
    ],
  ])(
    'échoue sur un contrat /token-status invalide (%s)',
    async (_label, canned) => {
      statusResponse = canned as Canned

      const { code, stdout } = await run()

      expect(code).toBe(1)
      expect(stdout).toContain('Contrat de réponse invalide')
    },
  )

  it('échoue si le backend est injoignable', async () => {
    // Port fermé : aucune connexion possible, aucun appel sortant.
    const { code, stdout } = await exec([
      `--userId=${USER_ID}`,
      '--apiBaseUrl=http://127.0.0.1:1/api/v1',
    ])

    expect(code).toBe(1)
    expect(stdout).toContain('backend injoignable')
  })
})

describe('check-youtube-connection — avertissements (code 2)', () => {
  it('avertit sur un access token expiré mais renouvelable', async () => {
    statusResponse = {
      body: {
        accounts: [
          status({
            status: 'EXPIRED',
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
            hasRefreshToken: true,
          }),
        ],
      },
    }

    const { code, stdout } = await run()

    expect(code).toBe(2)
    expect(stdout).toContain('sera renouvelé au prochain appel')
  })

  it('avertit sur EXPIRING_SOON', async () => {
    statusResponse = {
      body: { accounts: [status({ status: 'EXPIRING_SOON' })] },
    }

    expect((await run()).code).toBe(2)
  })

  it('avertit sur un statut orphelin', async () => {
    statusResponse = {
      body: { accounts: [status(), status({ accountId: 'fantome' })] },
    }

    const { code, stdout } = await run()

    expect(code).toBe(2)
    expect(stdout).toContain('sans chaîne correspondante')
  })

  it('priorise un blocage sur un avertissement', async () => {
    statusResponse = {
      body: {
        accounts: [status({ status: 'EXPIRED', hasRefreshToken: false })],
      },
    }

    expect((await run()).code).toBe(1)
  })
})
