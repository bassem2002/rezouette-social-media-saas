/// Éléments de démonstration PUREMENT FRONTEND.
///
/// Tout ce qui est déclaré ici est une maquette : aucune de ces valeurs ne
/// provient du backend, aucune n'y est enregistrée, et aucune ne doit être
/// présentée à l'utilisateur comme une donnée réelle. Les regrouper dans un
/// fichier unique et explicitement nommé évite qu'une valeur factice se glisse
/// un jour dans un modèle de données ou dans un calcul de statistique.
///
/// Règle de lecture : si une information n'apparaît pas dans un modèle
/// `core/models/*.model.ts`, elle n'existe pas côté serveur.

/// Solde promotionnel affiché en pied de sidebar. Aucun système de crédits
/// n'existe côté backend : la valeur est une vitrine, jamais un solde réel.
export const demoCredits = {
  label: 'Free credits',
  amount: '$12.00',
} as const;

/// Lien « Documentation ». Route interne de remplacement tant qu'aucune
/// documentation publique n'est publiée — aucun domaine externe n'est appelé.
export const demoDocumentation = {
  label: 'Documentation',
  route: '/documentation',
} as const;

/// Sélecteur de profil de la page Connections. Le backend ne connaît pas la
/// notion de « profil » : le filtre reste local et n'est jamais transmis.
export const demoProfiles = [{ id: 'all', label: 'All profiles' }] as const;

/// Profil affiché dans la sidebar et pré-rempli dans les paramètres. Aucun
/// endpoint utilisateur n'existe encore côté backend : ces valeurs sont celles
/// du compte de démonstration, centralisées ici plutôt que recopiées dans les
/// écrans. Dès qu'un `/me` existera, il remplacera cette constante.
export const demoProfile = {
  name: 'Rezouette Demo',
  email: 'badersekrafi242@gmail.com',
} as const;

/// Marqueur « Default » des cartes de connexion. Purement décoratif : aucune
/// notion de compte par défaut n'existe en base.
export const DEMO_DEFAULT_BADGE = 'Default';

/// Message unique des fonctionnalités annoncées mais non implémentées. Un seul
/// texte pour toutes : impossible d'en laisser une prétendre le contraire.
export const COMING_SOON_MESSAGE = 'Fonctionnalité bientôt disponible';
