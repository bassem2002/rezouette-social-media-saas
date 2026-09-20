/// Concatène des classes conditionnelles sans dépendance externe.
/// Accepte chaînes, faux/nuls (ignorés) — suffisant pour notre design system.
type ClassInput = string | number | false | null | undefined;

export function cn(...inputs: ClassInput[]): string {
  return inputs.filter(Boolean).join(' ');
}
