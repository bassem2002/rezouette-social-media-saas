import { applyDecorators } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { registerDecorator, type ValidationOptions } from 'class-validator'

/// Validateur booléen STRICT.
///
/// Le ValidationPipe global est configuré avec
/// `transformOptions.enableImplicitConversion: true` (voir main.ts) : d'après la
/// métadonnée `design:type` d'une propriété `boolean`, class-transformer
/// convertit la valeur AVANT que la validation ne s'exécute. `'oui'`, `'false'`,
/// `0`, `3` ou `{}` deviennent alors des booléens et `@IsBoolean()` les accepte.
///
/// C'est sans conséquence pour un champ décoratif, mais inacceptable pour les
/// déclarations YouTube : `madeForKids` est une obligation légale (COPPA) et
/// `containsSyntheticMedia` une déclaration de contenu. Une chaîne `'false'`
/// silencieusement convertie en `true` produirait une déclaration ERRONÉE.
///
/// Ce décorateur combine deux choses :
/// 1. un `@Transform` qui relit la valeur BRUTE du corps HTTP (`obj[key]`),
///    annulant la conversion implicite pour cette seule propriété ;
/// 2. une contrainte qui n'accepte QUE les primitives `true` et `false`.
///
/// Le ValidationPipe global n'est pas modifié, et aucun DTO existant n'est affecté.
export function IsStrictBoolean(validationOptions?: ValidationOptions) {
  return applyDecorators(
    Transform(({ obj, key }) => (obj as Record<string, unknown>)[key]),
    StrictBooleanConstraint(validationOptions),
  )
}

function StrictBooleanConstraint(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey): void => {
    const propertyName = String(propertyKey)
    registerDecorator({
      name: 'isStrictBoolean',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return value === true || value === false
        },
        defaultMessage(): string {
          return `${propertyName} doit être un booléen strict (true ou false), sans conversion implicite`
        },
      },
    })
  }
}
