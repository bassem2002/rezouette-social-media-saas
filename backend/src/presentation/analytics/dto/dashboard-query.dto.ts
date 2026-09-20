import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, Matches } from 'class-validator'
import {
  DASHBOARD_RANGES,
  DEFAULT_DASHBOARD_RANGE,
  type DashboardRange,
} from '../../../application/analytics/analytics.util.js'

/// Même règle que `ParseUuidShapePipe` : on valide la FORME (8-4-4-4-12 hex)
/// sans contrainte de version, pour ne pas rejeter les UUID de test utilisés
/// par le frontend (00000000-0000-0000-0000-000000000001).
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/// Query de GET /analytics/dashboard.
///
/// `range` est volontairement une liste FERMÉE : accepter un nombre de jours
/// libre laisserait un client demander « 100000d » et déclencher un balayage
/// non borné de l'historique.
export class DashboardQueryDto {
  @ApiProperty({
    description: 'Utilisateur propriétaire des statistiques.',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @Matches(UUID_SHAPE, { message: 'userId doit être au format UUID' })
  userId!: string

  @ApiPropertyOptional({
    description: 'Fenêtre d’observation. Par défaut : 7d.',
    enum: DASHBOARD_RANGES,
    default: DEFAULT_DASHBOARD_RANGE,
  })
  @IsOptional()
  @IsIn(DASHBOARD_RANGES, {
    message: `range doit valoir ${DASHBOARD_RANGES.join(', ')}`,
  })
  range?: DashboardRange
}
