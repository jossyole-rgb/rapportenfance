# Procédure de déploiement

> **Aucun déploiement public ni traitement de données réelles n'a été effectué.** Avant toute mise en production avec des données de mineurs, les validations listées dans [RAPPORT.md](RAPPORT.md#validations-externes-requises) sont obligatoires (DPO, AIPD, hébergeur, contrats). Le choix de l'hébergeur et toute ressource payante relèvent d'une décision du porteur de projet.

## 1. Cible recommandée

- Un hébergement **en France / UE**, et **certifié HDS** si l'établissement ou le DPO considère que les écrits contiennent des données de santé (c'est souvent le cas : éléments de santé de l'enfant, soins, handicap).
- Un serveur applicatif Node.js 22 (conteneur ou VM) derrière un reverse proxy TLS.
- PostgreSQL 16 managé ou administré, **chiffré au repos**, accès réseau privé uniquement, `sslmode=require`.
- Un coffre-fort de secrets (variables d'environnement injectées, jamais de fichier `.env` sur disque partagé).
- Un relais SMTP de l'établissement ou d'un prestataire validé.

## 2. Variables d'environnement de production

| Variable | Exigence |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | compte dédié non superutilisateur, `sslmode=require` |
| `APP_URL` | URL **https** publique (refusé au démarrage sinon, sauf localhost) |
| `DATA_ENCRYPTION_KEY` | générée par `npm run keys:generate`, stockée dans le coffre-fort **et** sauvegardée hors ligne (voir § 5) |
| `DATA_ENCRYPTION_KEY_ID` | `v1`, puis `v2`… lors des rotations |
| `DATA_ENCRYPTION_KEYS_PREVIOUS` | clés précédentes pendant une rotation |
| `SMTP_URL`, `MAIL_FROM` | obligatoires en production (le stockage local des e-mails est refusé) |
| `AI_PROVIDER` | `local` (seule valeur disponible) |
| `SESSION_MAX_AGE_HOURS`, `SESSION_IDLE_TIMEOUT_MINUTES` | 10 h et 30 min par défaut |

## 3. Déploiement d'une version

```bash
npm ci
npx prisma generate
npm run build
npm run db:deploy          # migrations versionnées, jamais "migrate dev" en production
npm start                  # PORT=3000 par défaut
```

- Ne **jamais** exécuter `npm run db:seed` ni `db:reset` en production.
- **Amorçage** : créer le premier administrateur technique sur le serveur avec
  `npm run admin -- create-tech-admin --email prenom.nom@exemple.fr --name "Prénom Nom"`.
  La commande affiche un lien de définition du mot de passe (60 min, usage unique) : aucun mot de passe ne transite par la ligne de commande. La double authentification est exigée à la première connexion.
- Créer ensuite les établissements depuis l'écran **Plateforme** (double authentification exigée par défaut pour chaque nouvel établissement) ; chaque administrateur d'établissement invite ses utilisateurs.
- Autres commandes d'exploitation : `npm run admin -- reset-mfa --email …` (téléphone perdu, quand aucun autre administrateur ne peut le faire), `npm run admin -- unlock --email …`. Toutes sont tracées dans le journal d'audit.

### Variante conteneurisée (Docker Compose)

Fichiers fournis : `Dockerfile` (Node.js 22, utilisateur non privilégié, migrations appliquées au démarrage) et `docker-compose.yml` (application + PostgreSQL 16, base non exposée, application publiée sur `127.0.0.1:3000` derrière le reverse proxy, système de fichiers en lecture seule, aucune capacité Linux).

```bash
cp docker/db.env.example docker/db.env      # mot de passe fort
cp docker/app.env.example docker/app.env    # même mot de passe, APP_URL, clé, SMTP
docker compose up -d --build
docker compose exec app npm run admin -- create-tech-admin --email … --name "…"
# tâche planifiée de l'hôte :
# 15 2 * * *  cd /srv/rapportenfance && docker compose exec -T app npm run retention:purge
```

Vérifié le 15/10/2026 sur un poste de test : construction de l'image, migrations, démarrage, amorçage par la commande ci-dessus, puis activation forcée de la double authentification et reconnexion avec code et code de secours. Sauvegarde dans ce mode : `docker compose exec -T db pg_dump -U rapport --format=custom rapportenfance > sauvegarde.dump`.

## 4. Reverse proxy

- TLS 1.2+ uniquement, HSTS (l'application envoie déjà `Strict-Transport-Security`).
- Transmettre `X-Forwarded-For` (limitation de débit et journal d'audit utilisent l'IP).
- Taille de requête maximale ~1 Mo (les notes sont limitées à 30 000 caractères).
- Ne pas mettre en cache les réponses (l'application envoie `Cache-Control: no-store`).

## 5. Sauvegardes et restauration

**Sauvegarde quotidienne** (exemple) :

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > rapportenfance-$(date +%F).dump
```

- Les champs sensibles sont chiffrés par l'application : une sauvegarde est inexploitable sans la clé. **Conserver la clé séparément** des sauvegardes (coffre-fort + copie hors ligne sous double contrôle). **La perte de la clé rend définitivement illisibles toutes les notes et tous les écrits.**
- Rétention des sauvegardes à aligner sur la politique de conservation : un document purgé reste présent dans les sauvegardes jusqu'à leur expiration (à documenter dans le registre des traitements).

**Restauration** :

```bash
createdb rapportenfance_restore
pg_restore --no-owner -d rapportenfance_restore rapportenfance-AAAA-MM-JJ.dump
# démarrer une instance avec DATABASE_URL pointant vers la base restaurée et la même clé
```

Tester la restauration au moins une fois par trimestre et consigner le test.

## 6. Tâches planifiées

```cron
# Purge des documents archivés dont la durée de conservation est échue (chaque nuit)
15 2 * * *  cd /srv/rapportenfance && npm run retention:purge >> /var/log/rapportenfance-purge.log 2>&1
```

Chaque purge est tracée dans le journal d'audit (`retention.purged`, sans contenu). La même tâche supprime les enregistrements techniques expirés (sessions, vérifications de second facteur, jetons, compteurs de débit).

## 7. Rotation de la clé de chiffrement

1. Générer une nouvelle clé (`npm run keys:generate`).
2. Déployer avec `DATA_ENCRYPTION_KEY=<nouvelle>`, `DATA_ENCRYPTION_KEY_ID=v2`, `DATA_ENCRYPTION_KEYS_PREVIOUS="v1:<ancienne>"`.
3. Les nouvelles écritures utilisent v2 ; les anciennes restent lisibles.
4. Sauvegarder la base, puis ré-chiffrer les anciennes valeurs : `npm run keys:reencrypt -- --dry-run` (comptage), puis `npm run keys:reencrypt`.
5. Après vérification, retirer l'ancienne clé de `DATA_ENCRYPTION_KEYS_PREVIOUS`. **Conserver l'ancienne clé hors ligne tant que des sauvegardes antérieures existent.**

## 8. Plusieurs instances

- La limitation de débit (échecs de connexion par adresse IP, demandes de réinitialisation) et le verrouillage de compte sont stockés dans PostgreSQL : ils sont communs à toutes les instances.
- Les sessions sont en base : pas d'affinité de session nécessaire.

## 9. Supervision

- Les erreurs serveur sont journalisées avec un identifiant de référence affiché à l'utilisateur, **sans contenu des notes**.
- Ne pas activer de journalisation des corps de requêtes au niveau du proxy ou de l'APM (ils contiennent les notes).
- Alerter sur : échecs de démarrage (configuration), erreurs 5xx, échecs de la purge, pics d'événements `auth.login_failed` et `access.denied` dans le journal d'audit.
