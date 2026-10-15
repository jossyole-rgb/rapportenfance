# Installation (poste de développement ou de démonstration)

> Données **fictives uniquement**. Ne saisissez aucune donnée réelle d'enfant ou de famille dans une installation de développement ou de démonstration.

## 1. Prérequis

| Outil | Version testée |
| --- | --- |
| Node.js | 22 LTS ou plus récent |
| npm | 10+ |
| PostgreSQL | 16 |
| (tests E2E) Chromium via Playwright | fourni par `npx playwright install chromium` si absent |

## 2. Base de données

```bash
sudo -u postgres psql <<'SQL'
CREATE USER rapport WITH PASSWORD 'un-mot-de-passe-local';
CREATE DATABASE rapportenfance OWNER rapport;
CREATE DATABASE rapportenfance_test OWNER rapport;   -- base des tests d'intégration
SQL
```

La base `<nom>_test` est utilisée automatiquement par `npm run test:integration` (elle est vidée à chaque test : ne jamais la faire pointer vers une base utile).

## 3. Configuration

```bash
npm install
cp .env.example .env
npm run keys:generate
```

Renseigner dans `.env` :

- `DATABASE_URL` : `postgresql://rapport:un-mot-de-passe-local@localhost:5432/rapportenfance?schema=public`
- `DATA_ENCRYPTION_KEY` : la valeur affichée par `keys:generate` (32 octets base64)
- `PLATFORM_MFA_REQUIRED="false"` sur un poste de démonstration, pour que le compte de démonstration `tech@…` se connecte sans double authentification (en production, laisser `true`).
- Les autres valeurs par défaut conviennent en local. Sans `SMTP_URL`, les e-mails (invitations, réinitialisations) sont écrits dans `.dev-mailbox/`.

L'application refuse de démarrer si la configuration est invalide (validation au démarrage dans `src/instrumentation.ts`).

## 4. Schéma et jeu de démonstration

```bash
npm run db:deploy      # applique prisma/migrations
npm run db:seed        # établissements, utilisateurs, dossiers et un écrit 100 % fictifs
```

Le seed est refusé si `NODE_ENV=production` (sauf `ALLOW_DEMO_SEED=1`, réservé à un environnement de démonstration isolé).

## 5. Lancement

```bash
npm run dev                      # développement, http://localhost:3000
# ou
npm run build && npm start       # mode production local
```

Comptes de démonstration : voir le [README](../README.md#démarrage-rapide-local). Mot de passe commun : `Demo-RapportEnfance-2026!`.

Parcours conseillé :
1. `educatrice@demo.rapportenfance.fr` : ouvrir l'écrit de démonstration du dossier D-2026-0042, cliquer **Générer le projet d'écrit**, consulter les passages orange/rouge, compléter les rubriques « [À compléter] », cocher la checklist, **Marquer comme relu**.
2. `cheffe.service@demo.rapportenfance.fr` : ouvrir l'écrit, **Valider**, exporter en PDF ou DOCX.
3. `educateur@mecs.demo.rapportenfance.fr` : vérifier qu'aucun dossier de l'AEMO n'est visible.

## 6. Tests

```bash
npm run lint && npm run typecheck
npm run test:unit
npm run test:integration          # nécessite la base rapportenfance_test
npm run build && npm run db:seed && npm run test:e2e   # démarre/réutilise le serveur sur le port 3000
```

Les tests E2E créent de nouveaux écrits dans les données de démonstration. Pour repartir d'une base propre : `npm run db:reset` (supprime toute la base de développement puis rejoue migrations et seed).

Le test de double authentification active puis fait réinitialiser la double authentification du compte `assistant.social@…` : il remet le compte dans son état initial. S'il est interrompu, `npm run admin -- reset-mfa --email assistant.social@demo.rapportenfance.fr` rétablit le compte.

## 7. Problèmes fréquents

| Symptôme | Cause probable |
| --- | --- |
| `Configuration invalide (variables : …)` au démarrage | variable manquante ou mal formée, par exemple clé absente ou pas 32 octets base64 |
| Erreur serveur à l'ouverture d'un écrit, journal « Clé de chiffrement inconnue » | la clé a changé ; remettre l'ancienne dans `DATA_ENCRYPTION_KEYS_PREVIOUS` |
| Connexion impossible après plusieurs essais | compte verrouillé 15 min après 5 échecs (comportement voulu) ; `npm run admin -- unlock --email …` |
| Téléphone perdu | code de secours, ou réinitialisation par l'administrateur de l'établissement (**Utilisateurs**), ou `npm run admin -- reset-mfa --email …` |
| Session expirée rapidement | inactivité de 30 min (`SESSION_IDLE_TIMEOUT_MINUTES`) |
