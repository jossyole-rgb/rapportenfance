# Checklist de sécurité

Légende : ✅ en place et testé · ☑️ en place, non couvert par un test automatisé · ⬜ à faire / décision externe.

## Authentification et sessions

- ✅ Mots de passe hachés en Argon2id (paramètres OWASP), jamais stockés ni journalisés en clair.
- ✅ Politique : 12 caractères minimum, 3 types de caractères, différent de l'e-mail.
- ✅ Verrouillage 15 min après 5 échecs ; messages d'erreur génériques ; temps de réponse égalisé (pas d'énumération de comptes).
- ✅ Limitation de débit partagée entre instances (PostgreSQL, incrément atomique) : 50 échecs par adresse IP en 15 min, toutes tentatives confondues ; les connexions réussies ne sont pas comptées (une équipe derrière une même adresse n'est pas bloquée).
- ✅ Sessions en base, jeton aléatoire 256 bits dont seule l'empreinte SHA-256 est stockée ; cookie `HttpOnly`, `SameSite=Lax`, `Secure` et préfixe `__Host-` en production.
- ✅ Expiration absolue (10 h) et par inactivité (30 min).
- ✅ Révocation des sessions au changement / à la réinitialisation du mot de passe, à la désactivation du compte ou de l'établissement.
- ✅ Réinitialisation par jeton à usage unique, durée 1 h, empreinte seule stockée.
- ✅ Inscription uniquement sur invitation nominative (7 jours, usage unique).
- ✅ Double authentification TOTP (RFC 6238, application d'authentification du téléphone), implémentée localement sans service tiers : secret chiffré en base, anti-rejeu, 8 codes de secours à usage unique (empreintes seules), échecs comptés dans le verrouillage du compte.
- ✅ Obligatoire par défaut pour chaque nouvel établissement et pour l'administration technique ; tant qu'elle n'est pas activée, aucune page ni action n'est accessible. Réinitialisation par l'administrateur de l'établissement (sessions fermées), tracée.
- ✅ Amorçage de production sans mot de passe en ligne de commande (lien de définition à usage unique).

## Contrôle d'accès

- ✅ Toutes les vérifications sont faites **côté serveur** dans la couche service (jamais seulement dans l'interface).
- ✅ Isolation par établissement : chaque requête est filtrée par `organizationId` ; une ressource d'un autre établissement répond « introuvable » et le refus est journalisé (`access.denied`).
- ✅ Un professionnel ne voit que les dossiers dont il est membre.
- ✅ L'administrateur d'établissement n'a **aucun accès** au contenu des notes et écrits.
- ✅ L'administrateur technique n'a accès à aucune donnée d'établissement.
- ✅ Validation : par un validateur distinct de l'auteur en mode « chef de service ».
- ✅ Export définitif impossible avant validation (serveur) ; export de travail marqué « BROUILLON NON VALIDÉ ».
- ✅ Contrôles d'accès couverts par les tests d'intégration et E2E (autre établissement, admin technique).

## Protection des données

- ✅ Chiffrement applicatif AES-256-GCM des notes, contenus des écrits, analyses, objet, personnes présentes, lieu et prénom de l'enfant ; identifiant de clé pour la rotation. Vérifié par test (lecture brute en base).
- ✅ Journal d'audit **sans contenu sensible** (métadonnées uniquement), vérifié par test.
- ✅ Erreurs serveur journalisées sans données métier, avec identifiant de référence.
- ✅ Identifiant de dossier pseudonyme ; l'interface rappelle de ne pas saisir nom de famille, adresse ou numéro.
- ✅ Durée de conservation paramétrable par établissement + purge planifiable, tracée.
- ✅ Aucune donnée transmise à un service tiers : moteur de rédaction local, exports générés sur le serveur, pas de police, script ou traceur externe.
- ✅ Jeux de données de démonstration 100 % fictifs ; seed refusé en production.
- ⬜ Chiffrement au repos de la base et des sauvegardes côté hébergeur (dépend de l'hébergeur retenu).
- ✅ Ré-chiffrement en masse après rotation de clé (`npm run keys:reencrypt`, mode simulation), vérifié par test.
- ⬜ Export des données d'une personne / droit d'accès (procédure à définir avec le DPO).

## Sécurité web

- ✅ Content-Security-Policy avec nonce par requête et `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`.
- ✅ En-têtes : HSTS, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- ✅ `Cache-Control: no-store` sur toutes les pages et les exports.
- ✅ Protection CSRF : Server Actions (contrôle d'origine de Next.js) ; route d'export limitée à `Sec-Fetch-Site: same-origin`.
- ✅ Validation de toutes les entrées par schémas Zod côté serveur ; requêtes paramétrées (Prisma).
- ✅ Échappement React ; aucun `dangerouslySetInnerHTML` sur des contenus utilisateur.
- ✅ Verrou optimiste sur les versions (pas d'écrasement silencieux entre deux rédacteurs).
- ☑️ `npm audit --omit=dev` : 0 vulnérabilité à la date de livraison (une dépendance du CLI Prisma, `deepmerge-ts`, est forcée en version corrigée via `overrides`). Restent des alertes « braces » dans l'outillage eslint, utilisé uniquement en développement sur le code source du projet.

## IA et fiabilité des écrits

- ✅ Le moteur n'invente ni fait ni citation : tests sur des citations, dates, diagnostics et attributions inventés (détectés en rouge).
- ✅ Les informations manquantes sont signalées « [À compléter] » et **bloquent la validation**.
- ✅ La vérification est présentée comme une aide à la relecture, jamais comme une garantie.
- ✅ Chaque version conserve le moteur utilisé et son origine (génération, modification, restauration).
- ⬜ Avant tout fournisseur de modèle de langage externe : contrat de sous-traitance, localisation, non-réutilisation des données pour l'entraînement, AIPD.

## Exploitation (avant production)

- ⬜ Hébergeur validé (HDS selon l'analyse du DPO), base chiffrée, réseau privé.
- ⬜ Coffre-fort de secrets et sauvegarde hors ligne de la clé.
- ⬜ Sauvegardes testées (procédure dans [DEPLOIEMENT.md](DEPLOIEMENT.md#5-sauvegardes-et-restauration)).
- ⬜ Test d'intrusion par un prestataire indépendant.
- ⬜ Supervision et alertes ; procédure de gestion des violations de données (72 h CNIL).
