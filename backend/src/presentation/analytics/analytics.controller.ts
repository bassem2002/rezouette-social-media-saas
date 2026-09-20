import { Controller, Get, Query } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { AnalyticsService } from '../../application/analytics/analytics.service.js'
import { GetDashboardAnalyticsUseCase } from '../../application/analytics/use-cases/get-dashboard-analytics.use-case.js'
import { DEFAULT_DASHBOARD_RANGE } from '../../application/analytics/analytics.util.js'
import { ParseUuidShapePipe } from '../social/pipes/parse-uuid-shape.pipe.js'
import {
  DailyResponseDto,
  ErrorsResponseDto,
  OverviewResponseDto,
  PlatformsResponseDto,
  ScheduledResponseDto,
} from './dto/analytics-response.dto.js'
import { DashboardQueryDto } from './dto/dashboard-query.dto.js'
import { DashboardResponseDto } from './dto/dashboard-response.dto.js'

/// Endpoints Analytics (lecture seule). Couche présentation pure : délègue au
/// service Analytics, ne touche jamais Prisma directement. `userId` optionnel :
/// filtre par utilisateur si fourni, sinon statistiques globales.
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly dashboard: GetDashboardAnalyticsUseCase,
  ) {}

  /// Vue d'ensemble du tableau de bord. Les anciens endpoints ci-dessous sont
  /// INCHANGÉS : cet ajout est purement additif.
  @Get('dashboard')
  @ApiOperation({
    summary:
      'Tableau de bord : KPI, série quotidienne, répartitions, santé des connexions, activité récente et planifications à venir',
    description:
      'Statistiques calculées uniquement à partir des données locales (historique des publications, planifications, comptes connectés). Aucun appel n’est émis vers Facebook, Instagram, TikTok, LinkedIn ou YouTube, et aucun token n’est rafraîchi : la lecture est strictement passive.',
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  @ApiBadRequestResponse({
    description: 'userId absent ou mal formé, ou range hors de 7d / 30d / 90d.',
  })
  getDashboard(@Query() query: DashboardQueryDto): Promise<DashboardResponseDto> {
    return this.dashboard.execute(
      query.userId,
      query.range ?? DEFAULT_DASHBOARD_RANGE,
    )
  }

  /// Normalise le query `userId` optionnel (valide la forme UUID si présent).
  private resolveUserId(userId?: string): string | undefined {
    return userId ? new ParseUuidShapePipe().transform(userId) : undefined
  }

  @Get('overview')
  @ApiOperation({
    summary: 'KPI globaux : total, publiées, programmées, échouées, annulées, taux de réussite',
  })
  @ApiQuery({ name: 'userId', required: false, format: 'uuid' })
  @ApiOkResponse({ type: OverviewResponseDto })
  overview(@Query('userId') userId?: string): Promise<OverviewResponseDto> {
    return this.analytics.overview(this.resolveUserId(userId))
  }

  @Get('platforms')
  @ApiOperation({ summary: 'Répartition des publications par plateforme (FB / IG)' })
  @ApiQuery({ name: 'userId', required: false, format: 'uuid' })
  @ApiOkResponse({ type: PlatformsResponseDto })
  platforms(@Query('userId') userId?: string): Promise<PlatformsResponseDto> {
    return this.analytics.platforms(this.resolveUserId(userId))
  }

  @Get('errors')
  @ApiOperation({ summary: 'Répartition des erreurs par raison Meta (fréquence)' })
  @ApiQuery({ name: 'userId', required: false, format: 'uuid' })
  @ApiOkResponse({ type: ErrorsResponseDto })
  errors(@Query('userId') userId?: string): Promise<ErrorsResponseDto> {
    return this.analytics.errors(this.resolveUserId(userId))
  }

  @Get('daily')
  @ApiOperation({ summary: 'Publications par jour sur les 30 derniers jours' })
  @ApiQuery({ name: 'userId', required: false, format: 'uuid' })
  @ApiOkResponse({ type: DailyResponseDto })
  daily(@Query('userId') userId?: string): Promise<DailyResponseDto> {
    return this.analytics.daily(this.resolveUserId(userId))
  }

  @Get('scheduled')
  @ApiOperation({ summary: 'État des publications programmées (par statut)' })
  @ApiQuery({ name: 'userId', required: false, format: 'uuid' })
  @ApiOkResponse({ type: ScheduledResponseDto })
  scheduled(@Query('userId') userId?: string): Promise<ScheduledResponseDto> {
    return this.analytics.scheduled(this.resolveUserId(userId))
  }
}
