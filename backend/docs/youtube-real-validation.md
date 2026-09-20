# Validation réelle de l'intégration YouTube

> **Aucune étape de ce document n'a été exécutée.** Le code YouTube de Zernio est
> intégralement implémenté et testé **avec des mocks** : aucun projet Google Cloud
> n'existe, aucun credential n'est provisionné, aucun consentement n'a été donné,
> aucune vidéo n'a jamais été envoyée. Ce guide décrit la marche à suivre pour
> effectuer cette première validation — et pour revenir en arrière si nécessaire.

---

## Avant de commencer

| Pré-requis | Détail |
|---|---|
| Compte Google | Avec **au moins une chaîne YouTube** déjà créée. Un compte sans chaîne fait échouer le callback en `CHANNEL_NOT_FOUND` (comportement attendu). |
| Backend joignable par le navigateur | **`http://localhost:3000` suffit** pour un test OAuth local : c'est *votre navigateur* qui suit la redirection vers le callback, pas les serveurs de Google. Un tunnel (ngrok ou équivalent) n'est nécessaire que si le backend doit être atteint depuis une autre machine, ou pour valider un média téléchargeable par Meta/TikTok. |
| Vidéo de test | **Courte et sans enjeu** (quelques secondes, quelques Mo). Le quota d'envoi est limité (voir §Quotas). |
| Base de données | PostgreSQL démarré, 10 migrations appliquées. |

---

## 0 · Deux commandes pour se guider

```bash
# Avant OAuth : cohérence des variables (aucun appel réseau, aucun secret affiché)
npm run youtube:preflight

# Après OAuth : la connexion est-elle exploitable ? (interroge le backend Zernio, jamais Google)
npm run youtube:check -- --userId=00000000-0000-0000-0000-000000000001
```

Codes de sortie communs : **0** prêt · **1** bloquant · **2** avertissement.
Tant que les credentials ne sont pas renseignés, `youtube:preflight` **doit** sortir en `1` —
c'est le résultat attendu, pas une panne.

---

## 1 · Projet Google Cloud

1. Créer un projet dédié (ne pas réutiliser un projet de production existant).
2. **Activer « YouTube Data API v3 »** dans la bibliothèque d'API.
3. Configurer l'**écran de consentement OAuth** :
   - type *External* (sauf organisation Google Workspace) ;
   - ajouter les scopes `.../auth/youtube.upload` et `.../auth/youtube.readonly` ;
   - ajouter votre compte Google comme **utilisateur de test** tant que l'app
     reste en mode *Testing*.
4. Créer un **identifiant OAuth de type « Application Web »**.
5. Déclarer l'URI de redirection **exactement**, au choix :
   ```
   http://localhost:3000/api/v1/auth/youtube/callback      ← test local
   https://<domaine>/api/v1/auth/youtube/callback          ← tunnel / déployé
   ```
   Google **accepte `http://localhost`** comme URI de redirection (exception
   documentée à la règle HTTPS) : le tunnel n'est pas obligatoire.
   ⚠️ C'est bien la route **backend**. `FRONTEND_URL` ne se déclare pas ici : le
   retour vers Angular est un saut interne, postérieur au callback.

## 2 · Variables d'environnement

Renseigner dans `zernio-backend/.env` (jamais dans le dépôt). **Deux
configurations valides — choisir l'une ou l'autre, sans les mélanger :**

**A. Test local (le plus simple)**

```
YOUTUBE_CLIENT_ID=…
YOUTUBE_CLIENT_SECRET=…
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/v1/auth/youtube/callback
PUBLIC_BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:4200
OAUTH_STATE_SECRET=<openssl rand -base64 32>
```

**B. Via un tunnel (ngrok ou équivalent)**

```
YOUTUBE_CLIENT_ID=…
YOUTUBE_CLIENT_SECRET=…
YOUTUBE_REDIRECT_URI=https://<domaine>/api/v1/auth/youtube/callback
PUBLIC_BASE_URL=https://<domaine>
FRONTEND_URL=http://localhost:4200
OAUTH_STATE_SECRET=<openssl rand -base64 32>
```

⚠️ **`FRONTEND_URL` reste sur le port 4200 dans les deux cas** : c'est le port
d'`ng serve`, et c'est là que le backend renvoie le navigateur après le callback.
Le `5173` est celui du front React gelé.

⚠️ **`OAUTH_STATE_SECRET` n'est pas une variable YouTube.** Il appartient à la
configuration OAuth **partagée** (`oauth-security.config.ts`), commune à LinkedIn
et YouTube. `isYouTubeConfigured()` s'appuie sur cette configuration : sans ce
secret, les endpoints YouTube répondent **503** même avec des credentials Google
parfaitement valides.

**Laisser `YOUTUBE_PUBLISHING_ENABLED=false`** pour l'instant : on valide d'abord
la connexion, puis seulement ensuite la publication.

Vérifier la cohérence de l'ensemble **avant** d'ouvrir un navigateur :

```bash
npm run youtube:preflight
```

## 3 · Connexion OAuth

6. Démarrer le backend puis Angular (`ng serve`, port 4200).
7. Page **Comptes connectés** → « Connecter YouTube » → consentement Google.
8. Vérifier le retour sur `/accounts` (port **4200**) avec une notification de
   succès, puis :
   - la ou les chaînes apparaissent, avec nom, abonnés et vidéos ;
   - le contrôle automatisé passe :

   ```bash
   npm run youtube:check -- --userId=00000000-0000-0000-0000-000000000001
   ```

   Il échoue (code 1) si aucune chaîne n'est connectée, si `hasRefreshToken` est
   faux, si une reconnexion est requise, sur une 503, ou si le contrat de réponse
   est inattendu. Il avertit (code 2) sur un access token expiré ou proche de
   l'expiration — cas non bloquant, puisque le backend sait le renouveler.

> **Si `hasRefreshToken` est `false`**, le refresh token n'a pas été émis : la
> publication différée échouera dans l'heure. Révoquer l'accès dans le compte
> Google puis reconnecter (le backend force déjà `prompt=consent`).

9. Vérifier dans les **logs** : aucun token, aucun code, aucun `state`.

## 4 · Première publication

10. Passer `YOUTUBE_PUBLISHING_ENABLED=true` et **redémarrer** le backend
    (l'adaptateur est choisi au démarrage).
11. Uploader la vidéo de test via l'interface (`POST /media/upload`).
12. Publier en **`privacyStatus = private`** — impératif pour un premier test —
    et déclarer explicitement `madeForKids`.
13. Vérifier l'historique : la ligne est **PENDING**, avec un `publishId`.
14. Vérifier dans **YouTube Studio** que la vidéo est bien arrivée, en privé.
15. Attendre un ou deux cycles de réconciliation (`YOUTUBE_RECONCILE_INTERVAL_MS`,
    60 s par défaut) et vérifier le passage **PENDING → PUBLISHED**.
16. Vérifier que `externalPostId` est renseigné après cette transition.

## 5 · Publication programmée

17. Programmer une publication YouTube à ~2 minutes.
18. Vérifier que l'envoi démarre à l'échéance, que `ScheduledPost` passe
    `PUBLISHED` **dès l'acceptation de la vidéo**, et que le `SocialPost` suit
    ensuite son propre cycle (PENDING → PUBLISHED).

> Rappel : `scheduledAt` déclenche **le début de l'envoi**, pas l'heure de
> visibilité. Zernio n'utilise pas `status.publishAt`.

## 6 · Quotas

19. **Vérifier les quotas réellement attribués à votre projet** dans Google Cloud
    → *APIs & Services → Quotas*, **avant** les essais. Ne pas se fier à un chiffre
    de documentation : le quota accordé dépend du projet et peut être ajusté.

| Élément | Ordre de grandeur (à confirmer côté console) |
|---|---|
| Quota journalier par défaut | souvent 10 000 unités/jour |
| `videos.insert` | coût élevé — de l'ordre de 1 600 unités |
| `videos.list` (réconciliation) | ~1 unité (négligeable) |

⚠️ Un envoi coûte plusieurs centaines de fois une lecture : **quelques essais
peuvent suffire à épuiser la journée**. Relever la consommation réelle après le
premier upload plutôt que de l'estimer.

20. Vérifier les **politiques Google applicables** avant tout usage au-delà du
    test : une application non auditée utilisant `youtube.upload` verrouille
    généralement les vidéos en privé, et la distribution publique exige une
    revue Google. À confirmer sur la documentation en vigueur.

## 7 · Contrôles de sécurité

21. Confirmer qu'aucun log ne contient : access token, refresh token, code OAuth,
    `code_verifier`, URI de session d'upload, chemin absolu de fichier.
22. Confirmer que `<base>/uploads/.tmp/…` n'est **pas** servi.
23. Confirmer qu'aucune réponse d'API ne contient de token.
24. Les deux scripts de ce guide n'affichent **jamais** de valeur sensible :
    le préflight signale la *présence* d'un secret sans l'écho, et le contrôle
    post-connexion masque le `channelId` et n'affiche ni scope, ni metadata,
    ni token. Ils n'écrivent rien sur disque.

---

## Checklist de rollback

À exécuter dans cet ordre en cas de problème :

1. **`YOUTUBE_PUBLISHING_ENABLED=false`** puis redémarrage → l'adaptateur
   désactivé reprend la main, plus aucun octet ne part vers Google.
   Confirmer avec `npm run youtube:preflight` : la ligne « Publication
   désactivée pour le test OAuth » doit réapparaître.
2. **Révoquer l'accès** depuis le compte Google
   (*Compte Google → Sécurité → Applications tierces*) : les refresh tokens
   deviennent invalides et le backend basculera les comptes en
   `RECONNECT_REQUIRED` au prochain essai.
3. **Supprimer les comptes de test** (`SocialAccount` de plateforme `YOUTUBE`)
   si les tokens de test doivent disparaître de la base.
4. **Arrêter les schedulers** si nécessaire : la réconciliation cesse d'appeler
   `videos.list` (utile pour préserver du quota).
5. **Inspecter les `SocialPost` restés PENDING** : sans réconciliation, ils
   passeront `FAILED` après `YOUTUBE_RECONCILE_MAX_AGE_HOURS` (48 h par défaut).
   Vérifier dans YouTube Studio si les vidéos correspondantes existent, afin de
   ne pas les republier en double.
6. **Retirer les vidéos de test** de la chaîne.
7. **Supprimer ou faire tourner** `YOUTUBE_CLIENT_SECRET` et `OAUTH_STATE_SECRET`
   s'ils ont pu être exposés.

---

## Ce que cette validation ne couvre pas

- **Reprise d'upload après redémarrage** : les sessions ne sont pas persistées ;
  un redémarrage en cours de transfert perd la session (une nouvelle publication
  est alors nécessaire).
- **Déploiement multi-instance** : stores OAuth, single-flight de refresh et
  verrous de scheduler sont en mémoire.
- **Chiffrement des tokens au repos** : les tokens sont stockés en clair.
- **Statistiques YouTube distantes** : aucune vue, aucun like, aucun commentaire
  n'est collecté ; les analytics Zernio dérivent uniquement de l'historique local.
