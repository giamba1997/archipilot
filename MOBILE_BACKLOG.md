# ArchiPilot — Mobile : backlog & recommandations

> Synthèse des ajouts/finitions identifiés pendant la refonte mobile (Direction D).
> Philosophie : **mobile = capture + consultation** ; **édition lourde, facturation,
> planning et envoi de documents = desktop**. « Moins, mais le bon. »
>
> Statut au dernier commit : `3c860bb` (branches `master` + `poc-solo-launch`).

---

## ✅ Fait

### Écrans alignés sur les mockups `handoff_mobile`
- **Accueil** — hero « Démarrer une visite », Aujourd'hui, Mes chantiers, À proximité.
- **Tab bar** 3 destinations (Accueil / Chantiers / Notifs).
- **Chantiers (liste)** — recherche, filtres Tous/Chantier/Permis, pin carte.
- **Notifs** — groupes Nouveau / Plus tôt, échéances repliées.
- **Mode Chantier (visite)** — présents + météo, capture Photo/Vocal/Réserve,
  fil « Capturé », enregistrement réunion (overlay + pause + confirmation),
  animation micro, etc.
- **Créer une réserve** (popup) — grande zone de capture photo, description +
  dictée, gravité, lignes à icônes, CTA.
- **Détail réserve (lecture)** — nav retour + export, badges, photos, méta,
  suivi, note lecture seule.
- **Détail PV (lecture)** — titre + statut, bande méta (Météo / Postes /
  **Réserves** avec compteur), contenu par poste (surlignage urgent), photos
  liées, actions PDF / Partager + export en nav.
- **Assistant — Q&A** — avatar ✦, bulles aux bons coins, puce de contexte
  « {projet} · N documents », chips de suivi, input bordé.
- **Assistant — Historique** — « Conversations » + « Nouvelle », recherche,
  groupes datés.
- **Mon profil** — identité, abonnement, préférences (toggles fins), compte,
  note desktop, déconnexion ; compacté pour tenir sans scroll.

### Comportements
- **Enregistrement réunion en arrière-plan** — le recorder est hissé dans `App`
  (survit à la navigation) + Wake Lock ; bannière globale « Réunion en cours »
  cliquable pour revenir à l'enregistrement (mobile + desktop).
- **Réunion ajoutée à la visite** — au Stop confirmé, carte proéminente
  « Réunion enregistrée · MM:SS » dans le fil + transcription Whisper en
  arrière-plan injectée dans le PV.
- **Écran de confirmation post-visite** — « Visite terminée » + « Brouillon
  PV n°X créé » + récap + carte « Finalise sur ton ordinateur » + « Synchronisé ».
  → matérialise le choix **brouillon-only sur mobile, finalisation/envoi sur desktop**.
- **FAB assistant** terracotta + label d'amorce qui s'efface après ~4,5 s.
- **Largeur de contenu** élargie sur les onglets (marges réduites).

---

## 🔜 Recommandé (restant)

### ✅ P1 — Cohérence des marges *(fait — commit `8c51bbc`+)*
`MobileProjectConsult` repassé à **16px** (sections) / 20px (titre, labels),
aligné sur son mockup et les autres écrans de détail.

### ✅ P2 — Safe-area (encoche) sur les en-têtes *(fait — commit `8c51bbc`+)*
`env(safe-area-inset-top)` ajouté au padding haut de **`MobileHome`** et
**`MobileNotifs`** : le titre ne passe plus sous la barre d'état sur device à
encoche. (Invisible en navigateur, vérifié par build + tests.)

### ⛔ P3 — Création de projet sur mobile *(décidé : non nécessaire)*
**Décision actée : pas d'entrée de création permanente sur mobile.** Créer un
projet est une tâche de **setup** (nom, adresse, client, type, intervenants,
upload CCTP/plans) faite une fois par mandat, au bureau — jamais un geste de
terrain. Une entrée permanente irait à l'encontre du positionnement
*capture + consultation* et inviterait à une saisie lourde sur le mauvais écran.
Cohérent avec la décision PV (brouillon mobile → finalisation desktop).
- **Seul cas critique conservé** : le **cold-start** (nouvel utilisateur, 0 projet)
  doit pouvoir créer son 1ᵉʳ projet — couvert par l'**état vide**, pas par une
  entrée permanente. À garder à l'œil lors du QA mobile (cf. P4).
- **Évolution future possible (nice-to-have)** : *quick-create nom-seulement* sur
  chantier pour démarrer une capture immédiate, complété au bureau — même patron
  que le PV brouillon. Non bloquant.

### P4 — QA sur device réel (non vérifiable en headless)
- Enregistrement réunion en arrière-plan + Wake Lock sur **vrai téléphone**
  (iOS Safari peut suspendre l'audio au verrouillage écran — limite navigateur).
- Installation **PWA** (manifest, icône, splash).
- Comportement **hors-ligne** réel + file de synchro photos.
- **Cache du service worker** (forcer un hard-refresh après déploiement).
- Toggles, chips, FAB : vérifier qu'aucun petit bouton n'est ré-étiré à 44px
  (règle tactile globale) sur les écrans non audités.

---

## 🟡 Détails mineurs (optionnels)
- **Note écrite** : plus de bouton dédié dans le Mode Chantier (capture =
  Photo / Vocal / Réserve, conforme au mockup). Le composant `TextNoteSheet`
  existe encore mais n'est plus déclenché. À rebrancher si souhaité.
- **Citation de source** dans le chat (« CCTP · p.7 ») non branchée — nécessite
  un suivi document-par-document que le chat général n'a pas. La puce de
  contexte générique la remplace.

---

## ⛔ Hors périmètre `handoff_mobile` (non traités)
Affichés sur mobile mais restant des **vues desktop** (atteignables seulement en
drill-in, conformément à « édition lourde = desktop ») :
- Permis, Journal, Factures, Devis.
- Onboarding (wizard) et Login mobiles.

Ces écrans mériteraient une passe mobile dédiée si on veut couvrir le cycle
complet sur téléphone, mais ils sortent du cadre « capture + consultation » posé
pour cette refonte.

---

## Décision produit actée
**PV créé en brouillon uniquement sur mobile** → l'utilisateur finalise et envoie
depuis desktop. Justification : le PV est un document quasi-contractuel (envoi =
acte sortant difficile à rattraper), l'édition fine est pénible au pouce, et la
continuité « capture sur site → ça t'attend structuré au bureau » devient un
argument de vente plutôt qu'une limite. Garde-fous mis en place : écran de
confirmation rassurant (cf. ✅), lecture du brouillon possible sur mobile.
Évolution future possible : échappatoire « envoyer quand même » pour le solo
full-mobile.
