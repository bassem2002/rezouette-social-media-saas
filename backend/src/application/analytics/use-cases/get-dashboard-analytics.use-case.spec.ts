import { GetDashboardAnalyticsUseCase } from './get-dashboard-analytics.use-case.js'
import type {
  AnalyticsRepository,
  DailyStatusCounts,
  PlatformStatusCounts,
} from '../ports/analytics.repository.js'

const USER = '00000000-0000-0000-0000-000000000001'
const ALL_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE']

/// Instant figé : la série quotidienne dépend de « aujourd'hui ». Sans horloge
/// fixe, ces tests deviendraient sensibles à la date d'exécution.
const NOW = new Date('2026-08-04T10:30:00')

function platformRow(
  platform: string,
  buckets: Partial<Omit<PlatformStatusCounts, 'platform'>> = {},
): PlatformStatusCounts {
  return {
    platform,
    published: buckets.published ?? 0,
    failed: buckets.failed ?? 0,
    pending: buckets.pending ?? 0,
  }
}

/// Toutes les plateformes publiables, à 0 sauf celles surchargées — c'est le
/// contrat réel du repository (aucune plateforme ne disparaît de la réponse).
function allPlatformRows(
  overrides: Record<string, Partial<Omit<PlatformStatusCounts, 'platform'>>> = {},
): PlatformStatusCounts[] {
  return ALL_PLATFORMS.map((p) => platformRow(p, overrides[p] ?? {}))
}

type RepoOverrides = Partial<AnalyticsRepository>

function makeRepository(overrides: RepoOverrides = {}) {
  const repo: AnalyticsRepository = {
    // Endpoints historiques : non sollicités par le tableau de bord.
    socialStatusCounts: jest.fn(),
    platformCounts: jest.fn(),
    errorReasonCounts: jest.fn(),
    dailyCounts: jest.fn(),
    scheduledStateCounts: jest.fn(),

    statusCountsSince: jest
      .fn()
      .mockResolvedValue({ total: 0, published: 0, failed: 0, pending: 0 }),
    platformStatusCountsSince: jest.fn().mockResolvedValue(allPlatformRows()),
    dailyStatusCountsSince: jest.fn().mockResolvedValue([]),
    pendingScheduledCount: jest.fn().mockResolvedValue(0),
    accountHealthCounts: jest.fn().mockResolvedValue([]),
    recentPosts: jest.fn().mockResolvedValue([]),
    accountNames: jest.fn().mockResolvedValue([]),
    upcomingScheduledPosts: jest.fn().mockResolvedValue([]),
    ...overrides,
  }
  return { repo, useCase: new GetDashboardAnalyticsUseCase(repo) }
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(NOW)
})

afterAll(() => {
  jest.useRealTimers()
})

describe('GetDashboardAnalyticsUseCase — fenêtres', () => {
  it.each([
    ['7d', 7],
    ['30d', 30],
    ['90d', 90],
  ] as const)('la fenêtre %s produit %i points quotidiens', async (range, days) => {
    const { useCase } = makeRepository()

    const view = await useCase.execute(USER, range)

    expect(view.range).toBe(range)
    expect(view.daily).toHaveLength(days)
  })

  it('retient 7 jours par défaut quand aucune fenêtre n’est fournie', async () => {
    const { useCase } = makeRepository()

    const view = await useCase.execute(USER)

    expect(view.range).toBe('7d')
    expect(view.daily).toHaveLength(7)
  })

  it('ordonne la série chronologiquement et inclut les jours sans donnée', async () => {
    const daily: DailyStatusCounts[] = [
      { date: '2026-08-03', published: 3, failed: 1, pending: 1 },
    ]
    const { useCase } = makeRepository({
      dailyStatusCountsSince: jest.fn().mockResolvedValue(daily),
    })

    const view = await useCase.execute(USER, '7d')

    expect(view.daily.map((d) => d.date)).toEqual([
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ])
    // Jour renseigné : le total est la somme des trois statuts.
    expect(view.daily[5]).toEqual({
      date: '2026-08-03',
      total: 5,
      published: 3,
      failed: 1,
      pending: 1,
    })
    // Jour creux : des zéros explicites, jamais un trou ni un NaN.
    expect(view.daily[0]).toEqual({
      date: '2026-07-29',
      total: 0,
      published: 0,
      failed: 0,
      pending: 0,
    })
  })

  it('borne la lecture quotidienne à la fenêtre demandée', async () => {
    const dailyStatusCountsSince = jest.fn().mockResolvedValue([])
    const { useCase } = makeRepository({ dailyStatusCountsSince })

    await useCase.execute(USER, '30d')

    const since = dailyStatusCountsSince.mock.calls[0][0] as Date
    // 30 jours = aujourd'hui + les 29 précédents → minuit local le 6 juillet.
    expect(since.getFullYear()).toBe(2026)
    expect(since.getMonth()).toBe(6)
    expect(since.getDate()).toBe(6)
    expect(since.getHours()).toBe(0)
    expect(dailyStatusCountsSince.mock.calls[0][1]).toBe(USER)
  })
})

describe('GetDashboardAnalyticsUseCase — KPI et taux de réussite', () => {
  it('reporte les compteurs de statuts sans les réinterpréter', async () => {
    const { useCase } = makeRepository({
      statusCountsSince: jest
        .fn()
        .mockResolvedValue({ total: 68, published: 25, failed: 43, pending: 0 }),
      pendingScheduledCount: jest.fn().mockResolvedValue(7),
    })

    const view = await useCase.execute(USER, '30d')

    expect(view.summary.totalPosts).toBe(68)
    expect(view.summary.published).toBe(25)
    expect(view.summary.failed).toBe(43)
    expect(view.summary.scheduled).toBe(7)
    expect(view.summary.successRate).toBe(36.8)
  })

  it('exclut les PENDING du taux de réussite (une vidéo YouTube en traitement n’est pas un succès)', async () => {
    const { useCase } = makeRepository({
      statusCountsSince: jest
        .fn()
        .mockResolvedValue({ total: 8, published: 5, failed: 0, pending: 3 }),
      platformStatusCountsSince: jest
        .fn()
        .mockResolvedValue(
          allPlatformRows({ YOUTUBE: { published: 5, pending: 3 } }),
        ),
    })

    const view = await useCase.execute(USER, '7d')

    // 5 / (5 + 0) : les 3 vidéos en cours d'encodage ne pénalisent pas le taux…
    expect(view.summary.successRate).toBe(100)
    // …et ne sont surtout jamais comptées comme publiées.
    expect(view.summary.published).toBe(5)
    expect(view.summary.pending).toBe(3)

    const youtube = view.byPlatform.find((p) => p.platform === 'YOUTUBE')
    expect(youtube).toEqual({
      platform: 'YOUTUBE',
      total: 8,
      published: 5,
      failed: 0,
      pending: 3,
      successRate: 100,
    })
  })

  it('retourne 0 (jamais NaN) quand le dénominateur est nul', async () => {
    const { useCase } = makeRepository({
      statusCountsSince: jest
        .fn()
        .mockResolvedValue({ total: 4, published: 0, failed: 0, pending: 4 }),
    })

    const view = await useCase.execute(USER, '7d')

    expect(view.summary.successRate).toBe(0)
    expect(Number.isNaN(view.summary.successRate)).toBe(false)
  })

  it('renvoie une vue complète à zéro pour un utilisateur sans publication', async () => {
    const { useCase } = makeRepository()

    const view = await useCase.execute(USER, '7d')

    expect(view.summary).toEqual({
      totalPosts: 0,
      published: 0,
      failed: 0,
      pending: 0,
      scheduled: 0,
      connectedAccounts: 0,
      reconnectRequired: 0,
      successRate: 0,
    })
    expect(view.recentActivity).toEqual([])
    expect(view.upcomingScheduled).toEqual([])
    expect(view.byPlatform).toHaveLength(ALL_PLATFORMS.length)
    expect(view.daily.every((d) => d.total === 0)).toBe(true)
  })
})

describe('GetDashboardAnalyticsUseCase — répartitions', () => {
  it('expose les CINQ plateformes publiables, même à 0', async () => {
    const { useCase } = makeRepository()

    const view = await useCase.execute(USER, '7d')

    expect(view.byPlatform.map((p) => p.platform)).toEqual(ALL_PLATFORMS)
  })

  it.each(ALL_PLATFORMS)('compte les publications de %s', async (platform) => {
    const { useCase } = makeRepository({
      platformStatusCountsSince: jest
        .fn()
        .mockResolvedValue(
          allPlatformRows({ [platform]: { published: 4, failed: 1 } }),
        ),
    })

    const view = await useCase.execute(USER, '7d')

    expect(view.byPlatform.find((p) => p.platform === platform)).toEqual({
      platform,
      total: 5,
      published: 4,
      failed: 1,
      pending: 0,
      successRate: 80,
    })
  })

  it('ne compte jamais deux fois la même plateforme', async () => {
    const { useCase } = makeRepository({
      platformStatusCountsSince: jest.fn().mockResolvedValue(
        allPlatformRows({
          FACEBOOK: { published: 2 },
          YOUTUBE: { published: 3 },
        }),
      ),
    })

    const view = await useCase.execute(USER, '7d')

    expect(new Set(view.byPlatform.map((p) => p.platform)).size).toBe(
      ALL_PLATFORMS.length,
    )
    expect(view.byPlatform.reduce((sum, p) => sum + p.total, 0)).toBe(5)
  })

  it('ventile les trois statuts terminaux et non terminaux', async () => {
    const { useCase } = makeRepository({
      statusCountsSince: jest
        .fn()
        .mockResolvedValue({ total: 10, published: 5, failed: 2, pending: 3 }),
    })

    const view = await useCase.execute(USER, '7d')

    expect(view.byStatus).toEqual([
      { status: 'PUBLISHED', count: 5 },
      { status: 'FAILED', count: 2 },
      { status: 'PENDING', count: 3 },
    ])
  })
})

describe('GetDashboardAnalyticsUseCase — santé des connexions', () => {
  it('agrège comptes connectés et comptes à reconnecter (expirés inclus)', async () => {
    const { useCase } = makeRepository({
      accountHealthCounts: jest.fn().mockResolvedValue([
        {
          platform: 'FACEBOOK',
          total: 2,
          connected: 2,
          reconnectRequired: 0,
          expired: 0,
          error: 0,
          revoked: 0,
        },
        {
          platform: 'YOUTUBE',
          total: 3,
          connected: 1,
          reconnectRequired: 1,
          expired: 1,
          error: 0,
          revoked: 0,
        },
      ]),
    })

    const view = await useCase.execute(USER, '7d')

    expect(view.summary.connectedAccounts).toBe(3)
    // 1 marqué needsReconnect + 1 token expiré : les deux réclament une action.
    expect(view.summary.reconnectRequired).toBe(2)
    expect(view.accountHealth).toHaveLength(2)
  })
})

describe('GetDashboardAnalyticsUseCase — activité récente', () => {
  const rows = [
    {
      id: 'p2',
      platform: 'INSTAGRAM',
      status: 'PUBLISHED',
      accountId: 'acc-1',
      caption: '  Nouvelle   collection  ',
      createdAt: new Date('2026-08-04T09:00:00Z'),
      publishedAt: new Date('2026-08-04T09:00:05Z'),
    },
    {
      id: 'p1',
      platform: 'FACEBOOK',
      status: 'FAILED',
      accountId: 'acc-unknown',
      caption: null,
      createdAt: new Date('2026-08-03T09:00:00Z'),
      publishedAt: null,
    },
  ]

  it('demande 10 lignes au maximum, dans l’ordre fourni par le repository', async () => {
    const recentPosts = jest.fn().mockResolvedValue(rows)
    const { useCase } = makeRepository({ recentPosts })

    const view = await useCase.execute(USER, '7d')

    expect(recentPosts).toHaveBeenCalledWith(USER, 10)
    expect(view.recentActivity.map((a) => a.id)).toEqual(['p2', 'p1'])
  })

  it('résout les noms de comptes en UNE seule requête et laisse null l’irrésolu', async () => {
    const accountNames = jest
      .fn()
      .mockResolvedValue([{ id: 'acc-1', accountName: 'Hbshoply test' }])
    const { useCase } = makeRepository({
      recentPosts: jest.fn().mockResolvedValue(rows),
      accountNames,
    })

    const view = await useCase.execute(USER, '7d')

    expect(accountNames).toHaveBeenCalledTimes(1)
    expect(accountNames).toHaveBeenCalledWith(USER, ['acc-1', 'acc-unknown'])
    expect(view.recentActivity[0].accountName).toBe('Hbshoply test')
    expect(view.recentActivity[1].accountName).toBeNull()
  })

  it('normalise l’extrait de contenu et le laisse null quand il n’y en a pas', async () => {
    const { useCase } = makeRepository({
      recentPosts: jest.fn().mockResolvedValue(rows),
    })

    const view = await useCase.execute(USER, '7d')

    expect(view.recentActivity[0].excerpt).toBe('Nouvelle collection')
    expect(view.recentActivity[1].excerpt).toBeNull()
  })

  it('n’interroge aucun compte quand l’historique est vide', async () => {
    const accountNames = jest.fn().mockResolvedValue([])
    const { useCase } = makeRepository({ accountNames })

    await useCase.execute(USER, '7d')

    expect(accountNames).toHaveBeenCalledWith(USER, [])
  })
})

describe('GetDashboardAnalyticsUseCase — planifications à venir', () => {
  it('demande 5 lignes au maximum, à partir de maintenant', async () => {
    const upcomingScheduledPosts = jest.fn().mockResolvedValue([])
    const { useCase } = makeRepository({ upcomingScheduledPosts })

    await useCase.execute(USER, '7d')

    const [userId, from, limit] = upcomingScheduledPosts.mock.calls[0]
    expect(userId).toBe(USER)
    expect((from as Date).getTime()).toBe(NOW.getTime())
    expect(limit).toBe(5)
  })

  it('expose plateformes, échéance et extrait — sans le contenu intégral', async () => {
    const { useCase } = makeRepository({
      upcomingScheduledPosts: jest.fn().mockResolvedValue([
        {
          id: 's1',
          platforms: ['FACEBOOK', 'INSTAGRAM'],
          status: 'SCHEDULED',
          scheduledAt: new Date('2026-08-05T08:00:00Z'),
          message: 'Annonce produit du vendredi',
          caption: null,
        },
      ]),
    })

    const view = await useCase.execute(USER, '7d')

    expect(view.upcomingScheduled).toEqual([
      {
        id: 's1',
        platforms: ['FACEBOOK', 'INSTAGRAM'],
        status: 'SCHEDULED',
        scheduledAt: '2026-08-05T08:00:00.000Z',
        excerpt: 'Annonce produit du vendredi',
      },
    ])
  })
})

describe('GetDashboardAnalyticsUseCase — sûreté de la réponse', () => {
  it('ne laisse fuir aucun secret ni identifiant technique sensible', async () => {
    const { useCase } = makeRepository({
      recentPosts: jest.fn().mockResolvedValue([
        {
          id: 'p1',
          platform: 'FACEBOOK',
          status: 'PUBLISHED',
          accountId: 'acc-1',
          caption: 'Bonjour',
          createdAt: new Date('2026-08-04T09:00:00Z'),
          publishedAt: new Date('2026-08-04T09:00:01Z'),
        },
      ]),
      accountNames: jest
        .fn()
        .mockResolvedValue([{ id: 'acc-1', accountName: 'Page test' }]),
    })

    const view = await useCase.execute(USER, '7d')
    const serialized = JSON.stringify(view)

    for (const forbidden of [
      'accessToken',
      'refreshToken',
      'credentialGroupId',
      'uploadUri',
      'sessionUri',
      'passwordHash',
      'externalPostId',
      'publishId',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('n’émet aucune écriture ni aucun appel distant : seules les lectures du port sont sollicitées', async () => {
    const { repo, useCase } = makeRepository()

    await useCase.execute(USER, '7d')

    // Le port n'expose QUE des lectures ; on vérifie qu'aucun ancien endpoint
    // (potentiellement plus coûteux) n'est réquisitionné au passage.
    expect(repo.socialStatusCounts).not.toHaveBeenCalled()
    expect(repo.platformCounts).not.toHaveBeenCalled()
    expect(repo.dailyCounts).not.toHaveBeenCalled()
    expect(repo.scheduledStateCounts).not.toHaveBeenCalled()
    expect(repo.errorReasonCounts).not.toHaveBeenCalled()
  })
})
