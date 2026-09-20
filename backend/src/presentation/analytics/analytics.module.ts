import { Module } from '@nestjs/common'
import { AnalyticsController } from './analytics.controller.js'
import { AnalyticsService } from '../../application/analytics/analytics.service.js'
import { GetDashboardAnalyticsUseCase } from '../../application/analytics/use-cases/get-dashboard-analytics.use-case.js'
import { ANALYTICS_REPOSITORY } from '../../application/analytics/ports/analytics.repository.js'
import { PrismaAnalyticsRepository } from '../../infrastructure/prisma/repositories/prisma-analytics.repository.js'

/// Analytics : agrégations en lecture seule sur les tables existantes. Lie le
/// port ANALYTICS_REPOSITORY à son implémentation Prisma. PrismaService provient
/// du PrismaModule global — aucun autre import nécessaire.
@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    GetDashboardAnalyticsUseCase,
    { provide: ANALYTICS_REPOSITORY, useClass: PrismaAnalyticsRepository },
  ],
})
export class AnalyticsModule {}
