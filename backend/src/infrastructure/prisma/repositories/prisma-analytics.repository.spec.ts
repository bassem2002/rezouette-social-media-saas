import { PrismaAnalyticsRepository } from './prisma-analytics.repository.js'

/// Toutes les plateformes publiables doivent figurer dans la répartition —
/// c'est précisément ce qui manquait à LINKEDIN puis YOUTUBE.
const ALL_PLATFORMS = [
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'LINKEDIN',
  'YOUTUBE',
]

function makeRepository(groups: { platform: string; count: number }[] = []) {
  const groupBy = jest.fn().mockResolvedValue(
    groups.map((g) => ({ platform: g.platform, _count: { _all: g.count } })),
  )
  const prisma = {
    socialPost: { groupBy, findMany: jest.fn().mockResolvedValue([]) },
    scheduledPost: { groupBy: jest.fn().mockResolvedValue([]) },
  }
  return {
    repository: new PrismaAnalyticsRepository(prisma as never),
    groupBy,
  }
}

describe('PrismaAnalyticsRepository — répartition par plateforme', () => {
  it('retourne les CINQ plateformes publiables, dans un ordre stable', async () => {
    const { repository } = makeRepository()

    const counts = await repository.platformCounts()

    expect(counts.map((c) => c.platform)).toEqual(ALL_PLATFORMS)
  })

  it.each(ALL_PLATFORMS)('inclut %s même sans publication (bucket à 0)', async (platform) => {
    const { repository } = makeRepository()

    const counts = await repository.platformCounts()

    expect(counts.find((c) => c.platform === platform)).toEqual({
      platform,
      count: 0,
    })
  })

  it('compte LINKEDIN et YOUTUBE quand des publications existent', async () => {
    const { repository } = makeRepository([
      { platform: 'LINKEDIN', count: 4 },
      { platform: 'YOUTUBE', count: 7 },
    ])

    const counts = await repository.platformCounts()

    expect(counts.find((c) => c.platform === 'LINKEDIN')?.count).toBe(4)
    expect(counts.find((c) => c.platform === 'YOUTUBE')?.count).toBe(7)
  })

  it('ne compte jamais deux fois la même plateforme', async () => {
    const { repository } = makeRepository([
      { platform: 'YOUTUBE', count: 3 },
      { platform: 'FACEBOOK', count: 2 },
    ])

    const counts = await repository.platformCounts()

    expect(counts).toHaveLength(ALL_PLATFORMS.length)
    expect(new Set(counts.map((c) => c.platform)).size).toBe(ALL_PLATFORMS.length)
    expect(counts.reduce((sum, c) => sum + c.count, 0)).toBe(5)
  })

  it('filtre par utilisateur quand un userId est fourni', async () => {
    const { repository, groupBy } = makeRepository()

    await repository.platformCounts('user-1')

    expect(groupBy.mock.calls[0][0].where).toEqual({ userId: 'user-1' })
  })
})

describe('PrismaAnalyticsRepository — statuts globaux', () => {
  function makeStatusRepository(
    groups: { status: string; count: number }[],
  ) {
    const prisma = {
      socialPost: {
        groupBy: jest
          .fn()
          .mockResolvedValue(
            groups.map((g) => ({ status: g.status, _count: { _all: g.count } })),
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      scheduledPost: { groupBy: jest.fn().mockResolvedValue([]) },
    }
    return new PrismaAnalyticsRepository(prisma as never)
  }

  it('compte une vidéo YouTube en traitement comme PENDING, jamais comme succès', async () => {
    const repository = makeStatusRepository([
      { status: 'PENDING', count: 3 },
      { status: 'PUBLISHED', count: 5 },
      { status: 'FAILED', count: 2 },
    ])

    const counts = await repository.socialStatusCounts()

    // Une vidéo encore encodée reste en attente : la compter comme publiée
    // gonflerait artificiellement le taux de réussite.
    expect(counts).toEqual({ total: 10, published: 5, failed: 2, pending: 3 })
  })

  it('reste correct quand aucune publication n’existe', async () => {
    const repository = makeStatusRepository([])

    expect(await repository.socialStatusCounts()).toEqual({
      total: 0,
      published: 0,
      failed: 0,
      pending: 0,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Modèle de lecture du tableau de bord
// ─────────────────────────────────────────────────────────────────────────────

const USER = '00000000-0000-0000-0000-000000000001'
const SINCE = new Date('2026-07-29T00:00:00')

/// Prisma factice : chaque table expose les opérations réellement utilisées.
/// Aucune n'écrit — c'est la garantie structurelle qu'un GET analytics ne
/// modifie jamais les données.
function makeDashboardRepository(seed: {
  socialGroups?: Record<string, unknown>[]
  socialRows?: Record<string, unknown>[]
  accountGroups?: Record<string, unknown>[]
  accountRows?: Record<string, unknown>[]
  scheduledRows?: Record<string, unknown>[]
  scheduledCount?: number
} = {}) {
  const prisma = {
    socialPost: {
      groupBy: jest.fn().mockResolvedValue(seed.socialGroups ?? []),
      findMany: jest.fn().mockResolvedValue(seed.socialRows ?? []),
    },
    scheduledPost: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(seed.scheduledCount ?? 0),
      findMany: jest.fn().mockResolvedValue(seed.scheduledRows ?? []),
    },
    socialAccount: {
      groupBy: jest.fn().mockResolvedValue(seed.accountGroups ?? []),
      findMany: jest.fn().mockResolvedValue(seed.accountRows ?? []),
    },
  }
  return { repository: new PrismaAnalyticsRepository(prisma as never), prisma }
}

describe('PrismaAnalyticsRepository — statuts sur une fenêtre', () => {
  it('borne la lecture à la fenêtre et à l’utilisateur', async () => {
    const { repository, prisma } = makeDashboardRepository()

    await repository.statusCountsSince(SINCE, USER)

    expect(prisma.socialPost.groupBy.mock.calls[0][0].where).toEqual({
      userId: USER,
      createdAt: { gte: SINCE },
    })
  })

  it('ventile les trois statuts sans en inventer un quatrième', async () => {
    const { repository } = makeDashboardRepository({
      socialGroups: [
        { status: 'PUBLISHED', _count: { _all: 5 } },
        { status: 'FAILED', _count: { _all: 2 } },
        { status: 'PENDING', _count: { _all: 3 } },
      ],
    })

    expect(await repository.statusCountsSince(SINCE, USER)).toEqual({
      total: 10,
      published: 5,
      failed: 2,
      pending: 3,
    })
  })
})

describe('PrismaAnalyticsRepository — plateformes × statuts', () => {
  it('agrège les deux dimensions en UNE seule requête', async () => {
    const { repository, prisma } = makeDashboardRepository()

    await repository.platformStatusCountsSince(SINCE, USER)

    expect(prisma.socialPost.groupBy).toHaveBeenCalledTimes(1)
    expect(prisma.socialPost.groupBy.mock.calls[0][0].by).toEqual([
      'platform',
      'status',
    ])
  })

  it('retourne les cinq plateformes publiables, y compris à 0', async () => {
    const { repository } = makeDashboardRepository()

    const rows = await repository.platformStatusCountsSince(SINCE, USER)

    expect(rows.map((r) => r.platform)).toEqual(ALL_PLATFORMS)
    expect(rows.every((r) => r.published + r.failed + r.pending === 0)).toBe(true)
  })

  it('range une vidéo YouTube en traitement dans PENDING, jamais dans PUBLISHED', async () => {
    const { repository } = makeDashboardRepository({
      socialGroups: [
        { platform: 'YOUTUBE', status: 'PENDING', _count: { _all: 2 } },
        { platform: 'YOUTUBE', status: 'PUBLISHED', _count: { _all: 1 } },
        { platform: 'FACEBOOK', status: 'FAILED', _count: { _all: 4 } },
      ],
    })

    const rows = await repository.platformStatusCountsSince(SINCE, USER)

    expect(rows.find((r) => r.platform === 'YOUTUBE')).toEqual({
      platform: 'YOUTUBE',
      published: 1,
      failed: 0,
      pending: 2,
    })
    expect(rows.find((r) => r.platform === 'FACEBOOK')?.failed).toBe(4)
  })
})

describe('PrismaAnalyticsRepository — série quotidienne par statut', () => {
  it('regroupe par jour LOCAL et ne projette que deux colonnes', async () => {
    const { repository, prisma } = makeDashboardRepository({
      socialRows: [
        { createdAt: new Date('2026-08-03T08:00:00'), status: 'PUBLISHED' },
        { createdAt: new Date('2026-08-03T22:00:00'), status: 'FAILED' },
        { createdAt: new Date('2026-08-04T01:00:00'), status: 'PENDING' },
      ],
    })

    const rows = await repository.dailyStatusCountsSince(SINCE, USER)

    expect(prisma.socialPost.findMany.mock.calls[0][0].select).toEqual({
      createdAt: true,
      status: true,
    })
    expect(rows).toEqual([
      { date: '2026-08-03', published: 1, failed: 1, pending: 0 },
      { date: '2026-08-04', published: 0, failed: 0, pending: 1 },
    ])
  })

  it('ne retourne rien quand la fenêtre est vide', async () => {
    const { repository } = makeDashboardRepository()

    expect(await repository.dailyStatusCountsSince(SINCE, USER)).toEqual([])
  })
})

describe('PrismaAnalyticsRepository — santé des connexions', () => {
  function healthOf(platform: string, groups: Record<string, unknown>[]) {
    return makeDashboardRepository({ accountGroups: groups }).repository
      .accountHealthCounts(USER)
      .then((rows) => rows.find((r) => r.platform === platform))
  }

  it('classe un compte actif sans alerte comme connecté', async () => {
    const health = await healthOf('FACEBOOK', [
      {
        platform: 'FACEBOOK',
        status: 'ACTIVE',
        needsReconnect: false,
        _count: { _all: 2 },
      },
    ])

    expect(health).toMatchObject({ total: 2, connected: 2, reconnectRequired: 0 })
  })

  it('classe un compte marqué needsReconnect comme reconnexion requise', async () => {
    const health = await healthOf('TIKTOK', [
      {
        platform: 'TIKTOK',
        status: 'ACTIVE',
        needsReconnect: true,
        _count: { _all: 1 },
      },
    ])

    expect(health).toMatchObject({ total: 1, connected: 0, reconnectRequired: 1 })
  })

  it('compte UNE SEULE FOIS un compte à la fois expiré et à reconnecter', async () => {
    const health = await healthOf('YOUTUBE', [
      {
        platform: 'YOUTUBE',
        status: 'EXPIRED',
        needsReconnect: true,
        _count: { _all: 1 },
      },
    ])

    // Sans règle de priorité, ce compte gonflerait deux paniers à la fois.
    expect(health).toMatchObject({
      total: 1,
      expired: 1,
      reconnectRequired: 0,
      connected: 0,
    })
  })

  it('isole les comptes en erreur et les comptes révoqués', async () => {
    const { repository } = makeDashboardRepository({
      accountGroups: [
        {
          platform: 'LINKEDIN',
          status: 'ERROR',
          needsReconnect: false,
          _count: { _all: 1 },
        },
        {
          platform: 'LINKEDIN',
          status: 'REVOKED',
          needsReconnect: false,
          _count: { _all: 3 },
        },
      ],
    })

    const linkedin = (await repository.accountHealthCounts(USER)).find(
      (r) => r.platform === 'LINKEDIN',
    )

    expect(linkedin).toMatchObject({ total: 4, error: 1, revoked: 3, connected: 0 })
  })

  it('expose les cinq plateformes publiables même sans aucun compte', async () => {
    const { repository } = makeDashboardRepository()

    const rows = await repository.accountHealthCounts(USER)

    expect(rows.map((r) => r.platform)).toEqual(ALL_PLATFORMS)
  })

  it('ajoute une plateforme hors liste plutôt que de l’ignorer', async () => {
    const { repository } = makeDashboardRepository({
      accountGroups: [
        {
          platform: 'THREADS',
          status: 'ACTIVE',
          needsReconnect: false,
          _count: { _all: 1 },
        },
      ],
    })

    const rows = await repository.accountHealthCounts(USER)

    expect(rows.find((r) => r.platform === 'THREADS')).toMatchObject({
      total: 1,
      connected: 1,
    })
  })
})

describe('PrismaAnalyticsRepository — historique récent et planifications', () => {
  it('limite l’historique et le trie du plus récent au plus ancien', async () => {
    const { repository, prisma } = makeDashboardRepository()

    await repository.recentPosts(USER, 10)

    const args = prisma.socialPost.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ userId: USER })
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
    expect(args.take).toBe(10)
  })

  it('ne projette que des champs sûrs de l’historique', async () => {
    const { repository, prisma } = makeDashboardRepository()

    await repository.recentPosts(USER, 10)

    const select = prisma.socialPost.findMany.mock.calls[0][0].select as Record<
      string,
      boolean
    >
    expect(Object.keys(select).sort()).toEqual([
      'accountId',
      'caption',
      'createdAt',
      'id',
      'platform',
      'publishedAt',
      'status',
    ])
  })

  it('n’interroge pas la base quand aucun compte n’est à résoudre', async () => {
    const { repository, prisma } = makeDashboardRepository()

    expect(await repository.accountNames(USER, [])).toEqual([])
    expect(prisma.socialAccount.findMany).not.toHaveBeenCalled()
  })

  it('résout tous les comptes en une requête bornée au propriétaire', async () => {
    const { repository, prisma } = makeDashboardRepository({
      accountRows: [{ id: 'acc-1', accountName: 'Page test' }],
    })

    await repository.accountNames(USER, ['acc-1', 'acc-2'])

    expect(prisma.socialAccount.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.socialAccount.findMany.mock.calls[0][0]).toEqual({
      where: { userId: USER, id: { in: ['acc-1', 'acc-2'] } },
      select: { id: true, accountName: true },
    })
  })

  it('ne remonte que les planifications futures encore en attente', async () => {
    const from = new Date('2026-08-04T10:30:00')
    const { repository, prisma } = makeDashboardRepository()

    await repository.upcomingScheduledPosts(USER, from, 5)

    const args = prisma.scheduledPost.findMany.mock.calls[0][0]
    expect(args.where).toEqual({
      userId: USER,
      status: 'SCHEDULED',
      scheduledAt: { gte: from },
    })
    expect(args.orderBy).toEqual({ scheduledAt: 'asc' })
    expect(args.take).toBe(5)
  })

  it('compte les planifications en attente sans charger les lignes', async () => {
    const { repository, prisma } = makeDashboardRepository({ scheduledCount: 7 })

    expect(await repository.pendingScheduledCount(USER)).toBe(7)
    expect(prisma.scheduledPost.count).toHaveBeenCalledWith({
      where: { userId: USER, status: 'SCHEDULED' },
    })
  })
})
