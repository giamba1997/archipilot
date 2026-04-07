# ArchiPilot — Roadmap Features

## Priorité HAUTE

### 1. Collaboration multi-utilisateurs
- [x] Inviter des collaborateurs sur un projet (par email)
- [x] Rôles et permissions (admin, lecteur, contributeur)
- [x] Notifications en temps réel (nouveaux PV, modifications)
- [x] Système de commentaires (tables + API)
- [ ] Travail simultané sur un même projet (nécessite migration JSONB → relationnel)
- [ ] UI commentaires inline dans les remarques
- [ ] Presence (qui est en ligne sur le projet)

### 2. Envoi et diffusion des PV
- [x] Envoi du PV par email directement depuis l'app (Edge Function + Resend)
- [x] Liste de diffusion configurable (participants + ajout libre)
- [x] PDF joint en pièce jointe
- [x] Email brandé ArchiPilot avec aperçu du PV
- [x] Bouton envoi dans ResultView + modal historique PV
- [x] Statut PV mis à jour automatiquement ("envoyé")
- [x] Suivi de lecture (pixel tracking via Edge Function)
- [x] Historique d'envois (table pv_sends)
- [ ] Signature électronique du PV
- [ ] Portail client (accès lecture pour le maître d'ouvrage)

### 3. Réserves et levée de réserves
- [ ] Gestion dédiée des réserves (OPR / réception)
- [ ] Workflow de levée de réserves avec validation
- [ ] Rapport de réserves séparé du PV
- [ ] Localisation des réserves sur plan (lien avec marqueurs existants)

---

## Priorité MOYENNE

### 4. Rapports et statistiques
- [x] Dashboard global multi-projets (vue StatsView)
- [x] KPI cards : projets actifs, PV générés, actions ouvertes/urgentes, lots en retard
- [x] Répartition par phase (badges colorés par statut)
- [x] Barre de progression remarques (ouvertes vs résolues)
- [x] Tableau récapitulatif par projet (phase, PV, actions, avancement)
- [x] Performance par intervenant (actions ouvertes/fermées/urgentes par entreprise)
- [x] Navigation par clic vers le projet depuis le tableau
- [x] Bouton d'accès rapide dans la sidebar (icône chart)
- [ ] Export PDF/Excel du rapport

### 5. Intégrations externes
- [x] Sync calendrier Google Calendar (lien direct depuis la réunion)
- [x] Export .ics pour Outlook / Apple Calendar
- [x] Export CSV : projets, actions, remarques (depuis le dashboard)
- [x] Export CSV participants (depuis la fiche projet)
- [x] Import CSV participants (depuis la fiche projet)
- [x] Intégration email — envoi PV (voir section 2)
- [ ] Intégration BIM (viewer IFC)
- [ ] Webhooks / API ouverte
- [ ] Intégration comptabilité / facturation

### 6. Gestion avancée du terrain
- [x] Météo du jour sur l'Overview (API OpenMeteo, gratuite, sans clé)
- [x] Géolocalisation : lien Google Maps depuis le widget météo
- [x] Présences / absences : pilules cochables dans le NoteEditor (step récap)
- [x] Présences/absences injectées dans le prompt IA + texte complet du PV
- [x] Horodatage automatique : heure de début (auto) + bouton "Marquer la fin"
- [x] Horodatage inclus dans le prompt IA + texte PV

### 7. Templates et personnalisation avancée
- [x] Templates de postes par type de chantier (6 templates : Standard, Rénovation, Construction neuve, Aménagement intérieur, Bâtiment public, Personnalisé)
- [x] Templates de PV / style IA (4 styles : Standard belge, Détaillé, Concis, Français)
- [x] Champs personnalisés par projet (label/valeur libres, affichés dans l'Overview + injectés dans le prompt IA)
- [x] Numérotation configurable des remarques (4 modes : Sans, Séquentielle, Par poste, Globale continue)
- [x] Sélection template postes + style PV à la création du projet
- [x] Modification style PV + numérotation dans le modal d'édition

### 8. Notifications et rappels
- [ ] Rappel automatique avant réunion de chantier
- [ ] Notification quand une action dépasse son délai
- [ ] Rappel de relance aux entreprises
- [ ] Email / push notifications

### 9. Mode tablette optimisé
- [x] Sidebar en overlay sur tablette/mobile (< 1024px) avec backdrop cliquable
- [x] Fermeture auto de la sidebar à la sélection d'un projet
- [x] Header compact sur mobile : masque search pill et texte profil
- [x] Overview en colonne unique sur mobile (< 768px)
- [x] KPI cards 2 colonnes sur mobile, 1 colonne sur extra-small
- [x] Modals plein écran sur mobile
- [x] Inputs 16px pour éviter le zoom iOS
- [x] Touch targets 44px minimum (boutons, liens, selects)
- [x] CTA "Nouveau PV" en mode touch-friendly (48px, padding 12/16)
- [x] Active state plus prononcé sur écrans tactiles (scale 0.95)
- [x] Padding contenu réduit sur mobile (12px)
- [x] Mode hors-ligne robuste : brouillons PV, photos locales, sync auto au retour

---

## Priorité BASSE

### 10. Facturation et suivi financier
- [ ] Suivi des coûts par lot
- [ ] Situations de travaux
- [ ] Avenants / ordres de service

---

## Quick wins (ratio valeur/effort optimal)

| Feature | Impact | Effort |
|---|---|---|
| Envoi du PV par email | Très élevé | Moyen |
| Météo + Présences sur le PV | Élevé | Faible |
| Gestion des réserves (OPR) | Élevé | Moyen |
| Dashboard multi-projets + stats | Élevé | Moyen |
| Rappels automatiques (réunion) | Moyen | Faible |
