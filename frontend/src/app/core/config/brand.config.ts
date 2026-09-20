/// Identité VISIBLE de l'application. Source unique des libellés de marque :
/// sidebar, titres, textes d'aide, messages de redirection OAuth.
///
/// Portée volontairement limitée à l'affichage. Les identifiants techniques
/// (nom des paquets, dossiers, variables d'environnement `VITE_*`, clés du
/// backend, tables) restent inchangés : les renommer casserait la configuration
/// existante sans rien apporter à l'utilisateur.
export const brand = {
  /// Nom affiché partout dans l'interface.
  name: 'Rezouette',
  /// Initiale du logotype carré de la sidebar.
  initial: 'R',
  /// Signature discrète (pied de sidebar).
  tagline: 'Rezouette · Social Suite',
  /// Description courte de l'application.
  description: 'Gestion des réseaux sociaux',
} as const;
