/// Réexport de compatibilité. Le validateur a été centralisé dans
/// `src/common/validators/` : il est désormais partagé par les DTO de
/// publication immédiate ET de planification, sans double implémentation.
/// Ce fichier préserve les imports existants.
export { IsStrictBoolean } from '../../../common/validators/is-strict-boolean.validator.js'
