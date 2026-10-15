# Architecture du MVP

## Choix techniques

| Couche | Choix | Justification |
| --- | --- | --- |
| Application | **Next.js 16 (App Router) + React 19 + TypeScript strict** | Un seul déploiement Node.js pour l'interface et l'API : moins de surface d'attaque et de coût d'exploitation qu'un front et une API séparés. Server Components : les données sensibles sont lues côté serveur, jamais via une API publique générique. |
| Mutations | **Server Actions** + une route API pour les exports | Protection CSRF native (contrôle d'origine), validation Zod côté serveur. |
| Style | **Tailwind CSS 4**, composants maison accessibles | Pas de dépendance UI lourde ; libellés, focus visibles, rôles ARIA. |
| Base | **PostgreSQL + Prisma 6**, migrations versionnées (`prisma/migrations`) | Robuste, hébergeable en France chez de nombreux prestataires (y compris HDS si nécessaire). |
| Mots de passe | **Argon2id** (`@node-rs/argon2`, paramètres OWASP) | Standard actuel. |
| Chiffrement applicatif | **AES-256-GCM** avec identifiant de clé (rotation) | Notes, contenu des écrits, propos, lieux, personnes présentes et prénom de l'enfant sont illisibles en base et dans les sauvegardes sans la clé. |
| Exports | **pdfkit** (PDF), **docx** (Word) | Génération côté serveur, sans service tiers. |
| Tests | **Vitest** (unitaires, intégration sur PostgreSQL réel), **Playwright** (bout en bout) | |

Prisma 6 a été retenu plutôt que Prisma 7/8 (versions récentes avec changement de configuration) pour la stabilité ; la migration est inscrite dans la feuille de route.

## Organisation du code

```
prisma/                 schéma, migrations, jeu de démonstration fictif
src/proxy.ts            CSP avec nonce par requête
src/app/(auth)/         connexion, mot de passe oublié, réinitialisation, invitation
src/app/(app)/          pages authentifiées (tableau de bord, dossiers, écrits, admin, plateforme)
src/app/actions/        Server Actions (fines : authentification + appel au service)
src/app/api/            export PDF/DOCX
src/lib/services/       logique métier : TOUTES les vérifications d'accès et de workflow sont ici
src/lib/auth/           sessions, garde de pages, matrice de permissions (fonctions pures)
src/lib/ai/             moteur de rédaction, vérificateur, complétude (code pur, testable)
src/lib/domain/         types d'écrits et trames, catégories, workflow (machine à états)
src/lib/export/         modèle d'export, PDF, DOCX
src/lib/security/       chiffrement, mots de passe
tests/                  unit, integration, e2e
```

## Modèle de données

`Organization` 1—n `User` (rôles multiples) · `Organization` 1—n `CaseFile` (dossier) n—n `User` via `CaseFileMember` · `CaseFile` 1—n `Document` (écrit) 1—n `DocumentVersion` (immuable) · `AuditLog` · `Session`, `PasswordResetToken`, `Invitation` (seules les empreintes SHA-256 des jetons sont stockées).

Champs chiffrés (suffixe `Enc`) : `Document.notesEnc`, `purposeEnc`, `attendeesEnc`, `meetingLocationEnc`, `CaseFile.childAliasEnc`, `DocumentVersion.contentEnc`, `analysisEnc`.
Champs en clair, consultables pour la recherche : identifiant de dossier (doit être pseudonyme), type, statut, dates, auteur.

## Contrôle d'accès

| Rôle | Dossiers et écrits | Validation | Administration |
| --- | --- | --- | --- |
| Professionnel | dossiers dont il est membre ; modifie ses écrits | en mode « auteur » uniquement | – |
| Validateur | tous les dossiers de l'établissement | oui (distinct de l'auteur en mode « chef de service ») | – |
| Admin établissement | **aucun contenu** ; métadonnées des archivés pour la conservation | – | utilisateurs, paramètres, journal, suppression des archivés |
| Admin technique | **aucun** | – | organisations |

Chaque service charge la ressource avec `organizationId = établissement de l'utilisateur`, vérifie l'appartenance au dossier, puis la permission. Une ressource d'un autre établissement répond « introuvable » (pas de fuite d'existence) et le refus est journalisé.

## Moteur de rédaction (« IA »)

Chaîne en 8 étapes (cahier des charges § 7.1) :

1-3. **Analyse, extraction, classification** (`DraftingProvider.analyze`) : découpage des notes en éléments sources, puis classement en 11 catégories (faits, observations, propos de l'enfant, des représentants légaux, tiers, analyse, hypothèse, ressources, vigilance, actions réalisées/prévues) avec auteur du propos, niveau de confiance et justification lisible.
4. **Construction** (`DraftingProvider.compose`) selon la trame du type d'écrit (rubriques obligatoires/facultatives, intitulés adaptés). Les rubriques obligatoires sans contenu reçoivent un marqueur « [À compléter …] » qui bloque la validation.
5-6. **Vérification** (`src/lib/ai/verifier.ts`), **indépendante du fournisseur** : chaque phrase est rapprochée des notes et du formulaire (recouvrement lexical normalisé, synonymes, racinisation), citations exactes, dates et nombres, attribution du propos, termes d'appréciation et de diagnostic absents des notes. Le même code s'exécute dans le navigateur (vérification en direct) et sur le serveur (contrôle faisant foi avant relecture et validation).
7. Présentation : éditeur, aperçu surligné, panneau des sources.
8. Validation humaine : workflow.

**Fournisseur actuel : `local-rules-v1`.** Moteur déterministe exécuté sur le serveur. Il ne reformule pas librement : il réorganise, attribue (« La mère explique : … ») et ponctue. Il ne peut donc pas inventer de fait, mais le style reste proche des notes. Les éléments évoquant une vigilance ou une ressource sont **proposés** au professionnel sans être insérés.

**Brancher un modèle de langage** : implémenter `DraftingProvider` (`src/lib/ai/types.ts`), l'enregistrer dans `getProvider` (`src/lib/ai/pipeline.ts`) et ajouter sa valeur à `AI_PROVIDER` (`src/lib/env.ts`). Le vérificateur continuera de contrôler sa production. Prérequis non techniques : voir [RAPPORT.md](RAPPORT.md#validations-externes-requises).
