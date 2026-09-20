import { YouTubeProcessingScheduler } from './youtube-processing.scheduler.js'
import type { ReconcileYouTubeVideosSummary } from '../../application/social/use-cases/reconcile-youtube-videos.use-case.js'

function summary(
  overrides: Partial<ReconcileYouTubeVideosSummary> = {},
): ReconcileYouTubeVideosSummary {
  return {
    scanned: 0,
    published: 0,
    failed: 0,
    stillProcessing: 0,
    deferred: 0,
    stale: 0,
    ...overrides,
  }
}

function makeScheduler(execute?: jest.Mock) {
  const reconcile = {
    execute: execute ?? jest.fn().mockResolvedValue(summary()),
  }
  return {
    scheduler: new YouTubeProcessingScheduler(reconcile as never),
    reconcile,
  }
}

/// Promesse contrôlée, pour faire se chevaucher deux ticks.
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('YouTubeProcessingScheduler', () => {
  it('déclenche la réconciliation à chaque tick', async () => {
    const { scheduler, reconcile } = makeScheduler()

    await scheduler.handleTick()

    expect(reconcile.execute).toHaveBeenCalledTimes(1)
  })

  it('ignore un tick pendant qu’un cycle est en cours', async () => {
    const gate = deferred<ReconcileYouTubeVideosSummary>()
    const execute = jest.fn().mockReturnValue(gate.promise)
    const { scheduler } = makeScheduler(execute)

    const first = scheduler.handleTick()
    // Tick concurrent : doit être ignoré, pas empilé.
    await scheduler.handleTick()

    expect(execute).toHaveBeenCalledTimes(1)
    gate.resolve(summary())
    await first
  })

  it('libère le verrou après un succès', async () => {
    const { scheduler, reconcile } = makeScheduler()

    await scheduler.handleTick()
    await scheduler.handleTick()

    expect(reconcile.execute).toHaveBeenCalledTimes(2)
  })

  it('libère le verrou après une exception', async () => {
    const execute = jest
      .fn()
      .mockRejectedValueOnce(new Error('panne'))
      .mockResolvedValueOnce(summary())
    const { scheduler } = makeScheduler(execute)

    await scheduler.handleTick()
    await scheduler.handleTick()

    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('absorbe l’exception : le timer n’est jamais interrompu', async () => {
    const { scheduler } = makeScheduler(
      jest.fn().mockRejectedValue(new Error('panne')),
    )

    await expect(scheduler.handleTick()).resolves.toBeUndefined()
  })

  it('ne loggue rien quand aucune publication n’a été examinée', async () => {
    const { scheduler } = makeScheduler()
    const log = jest
      .spyOn(
        (scheduler as unknown as { logger: { log: (m: string) => void } }).logger,
        'log',
      )
      .mockImplementation(() => undefined)

    await scheduler.handleTick()

    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('loggue un résumé de compteurs, sans donnée sensible', async () => {
    const { scheduler } = makeScheduler(
      jest.fn().mockResolvedValue(
        summary({ scanned: 3, published: 1, failed: 1, stale: 1, deferred: 1 }),
      ),
    )
    const log = jest
      .spyOn(
        (scheduler as unknown as { logger: { log: (m: string) => void } }).logger,
        'log',
      )
      .mockImplementation(() => undefined)

    await scheduler.handleTick()

    const message = log.mock.calls[0][0]
    expect(message).toContain('3 examinée(s)')
    expect(message).toContain('1 publiée(s)')
    // Aucun identifiant de vidéo, de compte, ni de token.
    expect(message).not.toMatch(/yt-|Bearer|token|http/i)
    log.mockRestore()
  })

  it('délègue INTÉGRALEMENT : aucune autre dépendance que le use case', () => {
    const { scheduler } = makeScheduler()

    // Le scheduler ne connaît ni Prisma, ni HttpService, ni le token service.
    const injected = Object.values(scheduler as unknown as Record<string, unknown>)
    expect(
      injected.some(
        (dep) =>
          typeof dep === 'object' &&
          dep !== null &&
          ('socialPost' in dep || 'get' in dep || 'ensureFresh' in dep),
      ),
    ).toBe(false)
  })
})
