import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'

/// Valide la *forme* UUID (8-4-4-4-12 hex) sans contrainte de version/variant,
/// contrairement à ParseUUIDPipe qui rejette les UUID de test "nil-like"
/// (ex. 00000000-0000-0000-0000-000000000001, version != 1-5).
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

@Injectable()
export class ParseUuidShapePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !UUID_SHAPE.test(value)) {
      throw new BadRequestException('userId doit être au format UUID')
    }
    return value
  }
}
