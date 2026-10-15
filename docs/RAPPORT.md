# Rapport de livraison du MVP

Date : 15 octobre 2026 · Version : 0.1.0 · Données utilisées : **exclusivement fictives**.

## En bref

Le MVP couvre les modules demandés : authentification et rôles, tableau de bord, dossiers, création d'écrit, moteur de rédaction en plusieurs étapes, contrôle des sources vert/orange/rouge, éditeur, contrôle qualité, workflow de validation, exports PDF/DOCX, historique, archivage, suppression et administration. Il fonctionne de bout en bout sur un poste local avec PostgreSQL. **Rien n'a été déployé publiquement, aucune ressource payante n'a été engagée, aucun service tiers n'est appelé.**

Le « moteur IA » livré est un **moteur local déterministe** (`local-rules-v1`) : il analyse, classe, structure et attribue les notes, sans reformulation libre. Il ne peut donc pas inventer, mais le style reste proche des notes. Un modèle de langage peut être branché derrière la même interface une fois le cadre juridique validé (voir plus bas).

## Résultats des tests (15/10/2026)

| Suite | Résultat | Contenu |
| --- | --- | --- |
| Lint (eslint) et typage (TypeScript strict) | ✅ sans erreur ni avertissement | |
| Unitaires (Vitest) | ✅ 16/16 | Exemple du cahier des charges, cas § 9.3 (passage non étayé en rouge), citation / date / diagnostic / attribution inventés détectés en rouge, reformulation en orange ; chiffrement et rotation de clé ; politique de mot de passe ; machine à états ; matrice de permissions ; découpage des phrases |
| Intégration (Vitest + PostgreSQL réel) | ✅ 15/15 | Isolation entre établissements ; chiffrement effectif en base ; accès limité aux membres du dossier ; administrateur sans accès au contenu ; journal d'audit sans données sensibles ; workflow complet ; export définitif refusé avant validation ; marquage brouillon ; rubriques « [À compléter] » bloquantes ; purge de conservation ; connexion, verrouillage, désactivation, expiration d'inactivité, réinitialisation, invitation |
| Bout en bout (Playwright, build de production) | ✅ 5/5 | Parcours éducatrice → génération → correction → relecture → validation par la cheffe de service → téléchargement PDF et DOCX ; isolation d'un autre établissement ; administrateur technique refusé ; redirection vers la connexion ; utilisation sur tablette (820×1180) |
| Dépendances (`npm audit --omit=dev`) | ✅ 0 vulnérabilité | Alertes restantes limitées à l'outillage de développement (eslint) |
| Contrôle visuel | ✅ | Écrans principaux et PDF brouillon / validé vérifiés sur captures |

Commandes : voir [INSTALLATION.md](INSTALLATION.md#6-tests).

## Fonctionnalités terminées et testées

| Module | État | Remarques |
| --- | --- | --- |
| Authentification, sessions, déconnexion, mot de passe oublié, invitation | ✅ | Argon2id, verrouillage, sessions révocables, expiration par inactivité |
| Rôles (professionnel, validateur, admin établissement, admin technique) et contrôle d'accès serveur | ✅ | Rôles cumulables ; isolation par établissement et par dossier |
| Tableau de bord | ✅ | Brouillons, à vérifier, à valider, validés, activité récente |
| Dossiers et membres | ✅ | Identifiant pseudonyme, prénom chiffré, archivage |
| Formulaire de création (12 types d'écrits) | ✅ | Bouton « Insérer l'exemple fictif » pour les démonstrations |
| Moteur de rédaction en 8 étapes, 11 catégories | ✅ | Aucune invention ; informations manquantes signalées ; vigilances et ressources proposées sans insertion automatique |
| Vérification vert / orange / rouge avec sources visibles | ✅ | En direct dans l'éditeur et côté serveur ; confirmation justifiée d'un passage ; présentée comme une aide, pas une garantie |
| « Qu'est-ce qui manque à mon rapport ? » | ✅ | |
| Éditeur par rubrique, aperçu surligné, versions | ✅ | Versions immuables, restauration, verrou contre l'écrasement concurrent |
| Contrôle qualité | ✅ | Contrôles automatiques, « indicateur de qualité rédactionnelle (indicatif) », checklist de relecture obligatoire. L'expression interdite n'est utilisée nulle part. |
| Workflow Brouillon → Généré → À vérifier → Relu → Validé → Exporté / Archivé | ✅ | Auteur, dates, version, validateur, horodatage ; réouverture tracée ; modes « auteur » ou « chef de service » |
| Exports PDF et DOCX | ✅ | En-tête de l'établissement, statut, version ; « BROUILLON NON VALIDÉ » sur tout export avant validation ; export définitif refusé côté serveur avant validation |
| Historique, recherche, filtres, archivage, suppression | ✅ | Suppression par l'auteur tant que l'écrit n'est pas validé, ou par l'administrateur pour les archivés ; purge de conservation planifiable |
| Administration (utilisateurs, établissement, journal, conservation, plateforme) | ✅ | |
| Sécurité (chiffrement applicatif, journal sans contenu, CSP, en-têtes) | ✅ | Détail : [SECURITE.md](SECURITE.md) |
| Interface ordinateur et tablette | ✅ | Menu adapté sur petit écran |

## Limites connues et non terminé

- **Style rédactionnel** : le moteur local ne reformule pas ; les phrases restent proches des notes (attribuées et ponctuées). La qualité « rapport fini » demandera un modèle de langage, soumis aux validations ci-dessous.
- **Aucun fournisseur IA externe branché** (volontairement).
- **Trames institutionnelles** définies dans le code ; pas encore d'éditeur pour l'établissement.
- **Pas d'authentification à deux facteurs.**
- **Limitation de débit en mémoire** (une seule instance) ; le verrouillage de compte, lui, est en base.
- **Comparaison visuelle de versions**, workflow multi-validateurs, dictée vocale, synthèses multi-écrits, API métier : feuille de route.
- **Amorçage de production** (création du premier administrateur technique sans le jeu de démonstration) : à écrire avant le premier déploiement réel.
- Sans serveur SMTP, les e-mails sont écrits localement (refusé en production).

Détail et priorités : [FEUILLE_DE_ROUTE.md](FEUILLE_DE_ROUTE.md).

## Validations externes requises

Ces points ne relèvent pas du développement et **conditionnent toute utilisation avec des données réelles** :

| # | Sujet | Qui | Pourquoi |
| --- | --- | --- | --- |
| 1 | **Analyse d'impact (AIPD)** et inscription au registre des traitements | DPO de l'établissement / du porteur | Données de mineurs, potentiellement sensibles (santé), à grande échelle : AIPD très probablement obligatoire |
| 2 | **Qualification des données** (données de santé ou non) et **choix de l'hébergeur** (HDS si nécessaire, France/UE) | DPO, juriste | Détermine l'hébergeur admissible et le coût |
| 3 | **Fournisseur de modèle de langage** éventuel : localisation, contrat de sous-traitance (art. 28 RGPD), non-réutilisation des données, durée de conservation chez le fournisseur | DPO, juriste, porteur de projet | Aucun fournisseur n'est considéré comme autorisé par défaut |
| 4 | **Durée de conservation** des écrits archivés et du journal d'audit | DPO, direction des établissements | Valeur par défaut technique : 1 825 jours, sans valeur juridique |
| 5 | **Mode de validation** par défaut (auteur seul ou chef de service) | Responsables métier | Choix d'organisation et de responsabilité |
| 6 | **Tests avec un groupe de professionnels** (cahier des charges § 24) : fidélité aux notes, pertinence des alertes, temps économisé, adéquation aux trames | Porteur de projet, professionnels | Valider l'utilité et calibrer le vérificateur |
| 7 | **Mentions et information des personnes** (familles, enfants) | DPO, juriste | Transparence sur l'outil d'aide à la rédaction |
| 8 | **Test d'intrusion** et revue de sécurité indépendante | Prestataire | Avant ouverture à des établissements |
| 9 | **Positionnement réglementaire** du produit (aide à la rédaction, pas de décision automatisée ; règlement européen sur l'IA) | Juriste | Formulations commerciales et obligations éventuelles |

## Décisions à prendre par le porteur de projet

1. Création ou rattachement d'un **dépôt Git** pour versionner et partager le code (aujourd'hui dans les fichiers du projet, historique Git local inclus).
2. Choix et budget de l'**hébergement** de démonstration puis de production.
3. Choix d'un **fournisseur de modèle de langage** (ou d'un modèle auto-hébergé), après les validations 1 à 3.
4. Constitution du **groupe de testeurs** professionnels.
