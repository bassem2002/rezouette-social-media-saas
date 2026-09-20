import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { DashboardQueryDto } from './dashboard-query.dto.js'

const USER = '00000000-0000-0000-0000-000000000001'

function validate(query: Record<string, unknown>) {
  return validateSync(plainToInstance(DashboardQueryDto, query), {
    whitelist: true,
    forbidNonWhitelisted: true,
  })
}

describe('DashboardQueryDto', () => {
  it.each(['7d', '30d', '90d'])('accepte la fenêtre %s', (range) => {
    expect(validate({ userId: USER, range })).toHaveLength(0)
  })

  it('accepte une requête sans fenêtre (le contrôleur retiendra 7d)', () => {
    expect(validate({ userId: USER })).toHaveLength(0)
  })

  it('rejette une fenêtre hors de la liste fermée', () => {
    const errors = validate({ userId: USER, range: '365d' })

    expect(errors).toHaveLength(1)
    expect(errors[0].property).toBe('range')
    // Message sûr : il énumère les valeurs permises, sans rien divulguer d'interne.
    expect(Object.values(errors[0].constraints ?? {}).join()).toContain(
      '7d, 30d, 90d',
    )
  })

  it('rejette un nombre de jours libre, qui autoriserait un balayage non borné', () => {
    expect(validate({ userId: USER, range: '100000' })).toHaveLength(1)
  })

  it('rejette un userId absent ou mal formé', () => {
    expect(validate({})).toHaveLength(1)
    expect(validate({ userId: 'not-a-uuid' })).toHaveLength(1)
  })

  it('accepte l’UUID « nil-like » utilisé par le frontend de démonstration', () => {
    // ParseUUIDPipe rejetterait cette valeur (version hors 1-5) : la validation
    // porte volontairement sur la FORME, comme ailleurs dans l'application.
    expect(validate({ userId: '00000000-0000-0000-0000-000000000001' })).toHaveLength(0)
  })
})
