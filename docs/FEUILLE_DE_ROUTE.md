# Feuille de route post-MVP

Ce document liste ce qui **n'est pas** dans le MVP. Les priorités sont proposées ; elles sont à arbitrer par le porteur de projet après les tests avec des professionnels (cahier des charges § 24).

## Priorité 1 : avant toute utilisation sur données réelles

| Sujet | Contenu | Dépendance |
| --- | --- | --- |
| Validations externes | DPO, AIPD, hébergeur, contrats : voir [RAPPORT.md](RAPPORT.md#validations-externes-requises) | décision porteur de projet |
| Authentification à deux facteurs | TOTP ou clé de sécurité, obligatoire pour validateurs et administrateurs | – |
| Amorçage de production | commande ponctuelle et tracée de création du premier administrateur technique (le seed de démonstration est refusé en production) | – |
| Limitation de débit partagée | stockage commun (PostgreSQL ou Redis) pour plusieurs instances | choix d'hébergement |
| Ré-chiffrement après rotation de clé | script de migration des valeurs chiffrées vers la clé courante | – |
| Test d'intrusion | audit indépendant | budget |
| Procédures RGPD | droit d'accès, rectification, registre, gestion des violations | DPO |

## Priorité 2 : qualité de rédaction

| Sujet | Contenu | Dépendance |
| --- | --- | --- |
| Fournisseur de modèle de langage | implémentation de `DraftingProvider` pour une reformulation fluide ; le vérificateur actuel contrôlerait sa production | cadre juridique et contrat validés, choix du fournisseur (hébergé en UE, sans réutilisation des données, idéalement modèle auto-hébergé) |
| Évaluation du moteur | corpus de notes fictives annotées par des professionnels, mesure des faux positifs/négatifs du vérificateur | groupe de testeurs |
| Modèles institutionnels avancés (§ 22) | éditeur de trames par l'administrateur d'établissement (rubriques, intitulés, consignes), aujourd'hui définies dans le code | – |

## Priorité 3 : évolutions fonctionnelles du cahier des charges (§ 22)

- Dictée vocale sécurisée et transcription (même exigence de cadre que pour un fournisseur IA si la transcription est externe).
- Workflow de validation chef de service enrichi : plusieurs niveaux, délégation, commentaires de relecture. Le MVP gère un validateur unique, distinct de l'auteur en mode « chef de service ».
- Comparaison visuelle entre deux versions (le MVP conserve, affiche et restaure les versions, sans différence surlignée).
- Synthèses préparées à partir de plusieurs écrits d'un même dossier.
- Intégration avec les logiciels métier via API (authentification de service, périmètre minimal).
- Tableaux de bord organisationnels agrégés, sans données personnelles.
- Rappels et échéances (date de rapport attendue, relances de validation).
- Mode pseudonymisé renforcé (remplacement automatique des noms détectés dans les notes avant traitement).
- Administration multi-établissements (groupement, association gestionnaire).

## Dette technique identifiée

- Migration vers Prisma 7 (nouvelle configuration `prisma.config.ts`, suppression de la clé `prisma.seed` du package.json).
- Journal de consultation : chaque ouverture d'écrit est tracée (`document.viewed`) ; prévoir une agrégation ou une purge du journal selon la durée décidée avec le DPO.
- Tests E2E : ajouter un parcours « mot de passe oublié » et « invitation » par l'interface (couverts aujourd'hui en intégration).
- Accessibilité : audit RGAA complet (le MVP suit les bonnes pratiques : libellés, focus, contrastes, navigation clavier, sans audit formel).
