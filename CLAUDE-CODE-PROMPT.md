# ARCHIPILOT — PROMPT CLAUDE CODE

Tu travailles sur ArchiPilot, une application web React (Vite) de gestion de chantier et génération de PV (procès-verbaux) pour architectes belges. Le projet est dans le dossier courant.

## CONTEXTE BUSINESS

ArchiPilot est un copilote IA pour architectes. Le concurrent principal est Archireport (app française, 24 000 users, pas d'IA). Notre avantage : l'IA transforme des notes brutes en PV professionnels. Marché cible : petits bureaux d'architecture (1-5 personnes) en Belgique francophone.

## STACK TECHNIQUE

- Frontend : React 18 + Vite, fichier principal `src/App.jsx`
- Pas de librairie UI externe (tout en inline styles)
- Palette sobre : gris clair (#F7F6F4), blanc (#FFFFFF), accent ambre (#D97B0D)
- Icônes : composant `Ico` avec SVG paths intégrés
- Pas de backend pour l'instant (prévu en FastAPI Python plus tard)
- API Claude pour la génération de PV (appel direct depuis le frontend pour le prototype)

## CE QUI EXISTE DÉJÀ

- Sidebar avec liste des projets + création de projet
- 7 statuts de cycle de vie : Esquisse, Avant-projet, Permis, Exécution, Chantier, Réception, Clôturé
- Overview projet avec KPI cards, infos éditables, participants (email + téléphone)
- Prise de notes par poste du cahier des charges
- Génération PV via API Claude (appel frontend)
- Historique des PV avec consultation (modale)
- Actions ouvertes avec checkbox (suivi entre PV)
- Dupliquer / archiver un projet
- Récurrence des réunions

## FEATURES À IMPLÉMENTER — CLASSÉES PAR PRIORITÉ

### P1 — CRITIQUES (sans ça, le produit n'est pas viable)

1. **Photos liées aux remarques**
   - Pendant la prise de notes d'un poste, pouvoir ajouter des photos (upload ou prise directe via caméra)
   - Chaque photo est associée à un poste spécifique
   - Les photos apparaissent dans le PV généré
   - Galerie de photos par poste

2. **Localisation sur plan**
   - Uploader un plan (PDF/image) par projet
   - Viewer de plan avec possibilité de poser des marqueurs numérotés
   - Chaque marqueur est lié à une remarque/poste
   - Les marqueurs apparaissent dans le PDF du PV

3. **Génération PDF professionnelle**
   - Transformer le PV généré en vrai PDF formaté (pas juste du texte copié)
   - En-tête avec logo du bureau, nom du projet, date, n° PV
   - Mise en page professionnelle : titres, sections numérotées, photos intégrées
   - Pied de page avec signature et coordonnées

4. **Template PDF personnalisable**
   - Page de settings bureau : upload logo, choix couleur primaire, police, infos de contact
   - Ces settings s'appliquent automatiquement à tous les PV générés
   - Aperçu du template avant génération

5. **Envoi email depuis l'app**
   - Après génération du PV, bouton "Envoyer par email"
   - Pré-remplir les destinataires depuis la liste des participants (leurs emails)
   - Possibilité de cocher/décocher les destinataires
   - Le PDF est en pièce jointe
   - Note : nécessite un backend (SMTP ou API email type Resend/SendGrid)

6. **Import de plans et documents**
   - Section "Documents" par projet
   - Upload de fichiers (PDF plans, cahier des charges, permis, photos)
   - Viewer intégré pour les PDF et images
   - Organisation par catégories (plans, administratif, photos)

7. **Mode hors-ligne / PWA**
   - Transformer l'app en Progressive Web App (PWA)
   - Service worker pour le cache des données
   - Permettre la prise de notes sans connexion
   - Synchronisation quand la connexion revient
   - Installable sur l'écran d'accueil du téléphone

### P2 — IMPORTANTES (nécessaires pour être compétitif)

8. **Annotations sur photos**
   - Après avoir pris/uploadé une photo, pouvoir dessiner dessus
   - Flèches, cercles, texte libre
   - Canvas HTML5 ou librairie type fabric.js

9. **Annotations sur plans**
   - Dessiner directement sur le plan uploadé
   - Outils : stylo, flèche, rectangle, texte
   - Les annotations sont sauvegardées par visite

10. **Statut par remarque**
    - Chaque remarque/observation peut avoir un statut : Nouvelle, En cours, Clôturée
    - Filtrer les remarques par statut
    - Report automatique des remarques non clôturées au PV suivant
    - Barrer visuellement les remarques clôturées

11. **Planning chantier simplifié**
    - Vue calendrier/timeline des interventions par lot
    - Date début/fin par lot avec barre de progression
    - Visualisation des retards (rouge si dépassé)
    - Pas un Gantt complet — juste un aperçu visuel

12. **Avancement par lot**
    - Dans l'overview du projet, % d'avancement par corps de métier
    - Mise à jour manuelle ou via les PV (compter les remarques clôturées)
    - Barre de progression colorée par lot

13. **Filtrer le PV par destinataire**
    - Lors de l'envoi, pouvoir filtrer : "envoyer à LAURENTY uniquement les remarques qui le concernent"
    - Chaque remarque est associée à un intervenant
    - Le PDF filtré ne contient que les remarques pertinentes pour le destinataire

14. **Stockage cloud des documents**
    - Les documents uploadés sont persistés (base de données + storage)
    - Accessible depuis n'importe quel appareil
    - Note : nécessite backend avec stockage fichiers (S3, Supabase Storage, etc.)

15. **Multi-utilisateurs et synchronisation**
    - Plusieurs architectes du même bureau peuvent travailler sur le même projet
    - Synchronisation en temps réel des modifications
    - Gestion des rôles (admin bureau, architecte, collaborateur)

16. **Rappel automatique des remarques non clôturées**
    - Quand on commence un nouveau PV, l'app pré-charge les remarques encore ouvertes du PV précédent
    - Section "Rappel du PV précédent" en haut du nouveau PV
    - L'architecte peut marquer comme clôturé ou reporter

### P3 — PLUS TARD (nice-to-have, différenciation)

17. **Check-lists / points de contrôle**
    - Templates de vérification par type de travaux (électricité, plomberie, etc.)
    - Cocher les points conformes / non conformes
    - Intégration dans le PV

18. **App entreprises (portail sous-traitants)**
    - Les entreprises (LAURENTY, etc.) ont un accès limité pour voir leurs remarques
    - Elles peuvent marquer comme "traité" et ajouter une photo de preuve
    - L'architecte valide

19. **Intégration cloud (Dropbox, Google Drive, OneDrive)**
    - Importer des documents directement depuis les services cloud
    - Sync bidirectionnelle

20. **Plugins BIM (Archicad, Revit)**
    - Exporter les remarques géolocalisées vers un modèle BIM
    - Importer les plans depuis le modèle BIM

21. **Signature électronique**
    - Signer le PV sur tablette (canvas tactile)
    - Signature du maître d'ouvrage et de l'architecte
    - Intégrée dans le PDF

22. **Marqueurs numérotés sur plans dans le PDF**
    - Les remarques localisées sur le plan apparaissent avec un numéro
    - Le plan annoté est inclus dans le PDF
    - Légende avec numéro → remarque

23. **Versionning des documents**
    - Garder l'historique des versions d'un plan
    - Comparer ancienne vs nouvelle version

24. **Recherche full-text dans les PV**
    - Barre de recherche globale
    - Chercher dans tous les PV de tous les projets
    - "Qui a mentionné les resserrages coupe-feu ?" → résultats avec PV + date

25. **Notifications et rappels**
    - Rappel avant la prochaine réunion (email ou push)
    - Notification quand une action est en retard
    - Résumé hebdomadaire des actions ouvertes

26. **Suivi budget / décomptes**
    - Budget initial par lot
    - Enregistrer les décomptes et suppléments
    - Alerte quand le budget est dépassé
    - Vue synthétique budget consommé vs restant

27. **Vérification fiches techniques vs cahier des charges**
    - Checklist auto des FT attendues par lot
    - Upload FT reçues, statut (reçue / validée / refusée)
    - Alertes pour les FT manquantes

28. **Import d'un ancien PV (PDF)**
    - Uploader un PV existant en PDF
    - L'IA l'analyse et extrait la structure (postes, remarques, actions)
    - Pré-remplit le projet à partir du PV importé

## CONVENTIONS DE CODE

- Tout dans `src/App.jsx` pour l'instant (on splittera en composants plus tard)
- Inline styles (pas de CSS externe, pas de Tailwind)
- Couleurs définies en constantes en haut du fichier
- Composant `Ico` pour les icônes SVG (ajouter de nouvelles icônes au dictionnaire `paths`)
- Composant `Modal` réutilisable pour les popups
- Composant `Field` réutilisable pour les champs de formulaire
- State géré avec useState au niveau App (on migrera vers un store si nécessaire)
- Pas de localStorage dans les artifacts Claude.ai (mais OK en local)

## TERMINOLOGIE MÉTIER

- PV = Procès-verbal (compte-rendu de réunion de chantier)
- MO = Maître d'ouvrage (le client)
- Lot = Corps de métier (ex: lot 45 = carrelage, lot 70 = techniques spéciales)
- FT = Fiche technique
- Cahier des charges = CSDC = document décrivant les travaux à réaliser
- Resserrage = colmatage des passages de tuyaux/câbles (coupe-feu ou acoustique)
- Réception provisoire = inspection finale avant livraison au client
- Poste = section numérotée du PV correspondant à un lot du cahier des charges

## COMMENT TRAVAILLER

Quand je te demande d'implémenter une feature :
1. Lis d'abord le fichier `src/App.jsx` pour comprendre la structure actuelle
2. Implémente la feature de manière cohérente avec le style existant
3. Teste que l'app compile sans erreur
4. Décris brièvement ce que tu as fait

Quand je te demande un changement de design :
1. Respecte la palette sobre (gris/blanc/ambre)
2. Garde la cohérence visuelle avec le reste de l'app
3. Mobile-first (max-width: 500px pour les composants principaux, responsive au-delà)
