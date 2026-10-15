# RapportEnfance IA

**Assistant de rédaction sécurisé pour les professionnels de la protection de l'enfance.**

RapportEnfance IA transforme les notes prises lors d'un entretien, d'une visite à domicile ou d'un rendez-vous en un **projet d'écrit professionnel structuré, factuel, traçable et modifiable**. Le professionnel garde la maîtrise du document : tout écrit doit être relu, corrigé et validé par une personne habilitée avant tout export définitif.

> Statut : **MVP en cours de développement, à tester exclusivement sur données fictives.**
> L'application est conçue en cohérence avec les recommandations de la HAS mais ne prétend à aucune certification ni conformité garantie.

## Fonctionnalités du MVP

| Module | Contenu |
| --- | --- |
| Authentification | Connexion, sessions serveur (cookie `HttpOnly`, expiration absolue et par inactivité), déconnexion, mot de passe oublié, inscription sur invitation, verrouillage après échecs, rôles, isolation par établissement |
| Tableau de bord | Brouillons, écrits à vérifier, à valider, validés, activité récente, raccourcis |
| Dossiers | Identifiant pseudonyme, prénom utilisé dans les notes (chiffré), membres du dossier, archivage |
| Création d'un écrit | 12 types d'écrits du cahier des charges, informations du professionnel et du rendez-vous, grande zone de notes |
| Moteur de rédaction | Analyse, extraction, classification en 11 catégories, construction selon la trame du type d'écrit, vérification, détection des affirmations non étayées |
| Contrôle des sources | Vert (étayé), orange (à vérifier), rouge (non retrouvé) ; consultation des éléments sources ; confirmation justifiée d'un passage |
| Éditeur | Édition par rubrique, vérification en direct, aperçu, suggestions non insérées, « Qu'est-ce qui manque à mon rapport ? » |
| Contrôle qualité | Contrôles automatiques + indicateur de qualité rédactionnelle (indicatif) + checklist de relecture obligatoire |
| Validation humaine | Brouillon → Généré → À vérifier → Relu → Validé → Exporté/Archivé, validateur et horodatage, réouverture tracée |
| Exports | PDF et DOCX avec en-tête institutionnel, version, statut ; export de travail marqué « BROUILLON NON VALIDÉ » |
| Historique | Recherche et filtres (dossier, type, auteur, date, statut), versions immuables, restauration, archivage, suppression, purge de conservation |
| Administration | Utilisateurs et invitations, paramètres de l'établissement, journal d'audit, conservation, organisations (administration technique) |

## Démarrage rapide (local)

Prérequis : Node.js 22+, PostgreSQL 16+.

```bash
npm install
cp .env.example .env            # puis renseigner DATABASE_URL
npm run keys:generate           # copier la clé produite dans .env (DATA_ENCRYPTION_KEY)
npx prisma migrate deploy
npm run db:seed                 # jeu de démonstration 100 % fictif
npm run build && npm start      # ou npm run dev
```

Ouvrir http://localhost:3000. Comptes de démonstration (mot de passe commun `Demo-RapportEnfance-2026!`) :

| Compte | Rôle |
| --- | --- |
| educatrice@demo.rapportenfance.fr | Professionnelle (auteure) |
| assistant.social@demo.rapportenfance.fr | Professionnel |
| cheffe.service@demo.rapportenfance.fr | Validatrice / cheffe de service |
| admin@demo.rapportenfance.fr | Administrateur établissement |
| educateur@mecs.demo.rapportenfance.fr | Professionnel d'un **autre** établissement (test d'isolation) |
| tech@demo.rapportenfance.fr | Administrateur technique |

Détails : [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Tests

```bash
npm run lint && npm run typecheck
npm run test:unit          # moteur, vérificateur, chiffrement, permissions, workflow
npm run test:integration   # services sur base PostgreSQL *_test : isolation, workflow, exports, auth
npm run test:e2e           # Playwright : parcours complet, isolation, tablette (serveur lancé + seed)
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) : choix techniques, modèle de données, moteur IA
- [Installation](docs/INSTALLATION.md)
- [Déploiement](docs/DEPLOIEMENT.md) : production, sauvegardes, restauration
- [Checklist de sécurité](docs/SECURITE.md)
- [Feuille de route](docs/FEUILLE_DE_ROUTE.md) : évolutions post-MVP
- [Rapport de livraison](docs/RAPPORT.md) : terminé, testé, restant, validations externes

## Avertissements

- **Aucune donnée réelle** ne doit être saisie avant les validations listées dans [docs/RAPPORT.md](docs/RAPPORT.md#validations-externes-requises) (DPO, AIPD, hébergement, contrats).
- Le moteur de rédaction actuel est **local et déterministe** : il structure et attribue les notes sans reformulation libre et sans service tiers. Aucun fournisseur de modèle de langage n'est branché tant qu'il n'est pas validé.
- Le contrôle anti-hallucination est une **aide à la relecture**, pas une garantie d'exactitude.
