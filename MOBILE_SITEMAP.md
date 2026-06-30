# ArchiPilot — Organigramme mobile

> Toutes les pages / écrans de la partie mobile et leur navigation.
> Philosophie : **capture + consultation** sur mobile ; édition lourde, envoi
> de documents et facturation sur desktop.

```
APP MOBILE (ArchiPilot)
│
├─ 🚪 ENTRÉE
│   ├─ Login (authentification Supabase)
│   └─ OnboardingWizard  ── 1er lancement / 0 projet ──►  crée le 1er projet  ──►  Accueil
│
├─ 🧭 PERSISTANT (sur toutes les pages)
│   ├─ Bottom bar :  [ Accueil ]   [ Chantiers ]   [ Notifs ]
│   ├─ FAB ✦ Assistant
│   └─ Bannières globales :  Hors-ligne  ·  Réunion en cours  ·  Reconnecté
│
├─ 🏠 ACCUEIL  (onglet 1)
│   ├─ Hero « Démarrer une visite » ─► Choisir un chantier ─► CHANTIERS (mode visite) ─► MODE CHANTIER
│   ├─ Aujourd'hui (échéances)        ─► CONSULTATION PROJET
│   ├─ Mes chantiers (cartes)         ─► CONSULTATION PROJET
│   ├─ « Tout voir »                  ─► CHANTIERS
│   ├─ À proximité                    ─► Carte des chantiers
│   └─ Avatar (haut-droite)           ─► PROFIL
│
├─ 🏗 CHANTIERS  (onglet 2)
│   ├─ Recherche
│   ├─ Filtres : Tous / Chantier / Permis
│   ├─ Pin carte                      ─► Carte des chantiers
│   └─ Carte projet ─►  • (mode visite) ─► MODE CHANTIER
│                       • (normal)      ─► CONSULTATION PROJET
│
├─ 🔔 NOTIFS  (onglet 3)
│   └─ Liste groupée (Nouveau / Plus tôt) + échéances (permis, réserves)
│
├─ ✦ ASSISTANT  (FAB, partout)
│   ├─ Q&A / Chat  (puce de contexte projet, bulles, chips de suivi)
│   └─ Historique des conversations  (recherche + groupes datés)  ◄─► « Nouvelle »
│
├─ 👤 PROFIL  (via avatar Accueil)
│   ├─ Identité · Abonnement · Préférences (notifs, proximité, synchro) · Compte
│   └─ « Gérer le compte »             ─► ProfileView (édition détaillée)
│
├─ 📁 CONSULTATION PROJET  (hub d'un projet)
│   ├─ PV de chantier ──────────────► DÉTAIL PV (lecture)
│   ├─ Réserves OPR  ───────────────► OPR — RÉSERVES (liste)
│   │                                    ├─ « Nouvelle réserve » / « Ajouter »  ─► CRÉER UNE RÉSERVE (popup)
│   │                                    └─ Carte réserve                       ─► DÉTAIL RÉSERVE (lecture)
│   ├─ Photos ──────────────────────► Galerie
│   ├─ Plans & documents ───────────► Visionneuse
│   └─ « Démarrer une visite » ─────► MODE CHANTIER
│
└─ 🎬 MODE CHANTIER  (visite en cours)
    ├─ Présents + météo
    ├─ Capturer sur le vif :
    │     ├─ Photo        ─► POPUP PHOTO (caméra / galerie → aperçu + annotation manuscrite/vocale)
    │     ├─ Note vocale  ─► POPUP NOTE VOCALE (dictée + halo audio)
    │     └─ Réserve      ─► CRÉER UNE RÉSERVE (popup, identique à l'OPR)
    ├─ Enregistrer la réunion ─► RGPD ─► OVERLAY ENREGISTREMENT (pause · photo · stop)
    │     └─ « Réduire » ─► bannière « Réunion en cours » (clic = revenir)
    │           Stop ─► ajoute « Réunion enregistrée » au fil + transcription Whisper
    ├─ Fil « Capturé » (photos · notes · réserves · réunion)
    └─ « Terminer » ─► POPUP TERMINER LA VISITE ─► ÉCRAN « VISITE TERMINÉE »
                                                    (brouillon PV créé → finalisation/envoi sur desktop)

POPUPS / BOTTOM-SHEETS (couche au-dessus des pages)
  • Photo · Note vocale · Créer une réserve · Terminer la visite
  • Overlay enregistrement réunion · RGPD
  • Détail réserve (lecture) · Détail PV (lecture)
  → tous en « bottom sheet » Direction D (poignée de fermeture ronde, slide-up).
```

## Légende des états spéciaux
- **OnboardingWizard** : seul chemin de création de projet sur mobile (cold-start).
  Pas d'entrée de création permanente ailleurs (décision produit).
- **Écran « Visite terminée »** : matérialise le PV brouillon-only (finalisation desktop).
- **Bannières globales** : hors-ligne (captures enregistrées), réunion en cours
  (revenir à l'enregistrement), reconnecté (sync au retour).
