# ArchiPilot — Audit UX/UI complet

> Audit réalisé le 09/04/2026. Chaque point est actionnable et priorisé.
> Légende : `[P0]` critique, `[P1]` important, `[P2]` amélioration, `[P3]` nice-to-have

---

## 1. SYSTÈME DE DESIGN

### 1.1 Espacement (spacing)
- [x] `[P1]` **Standardiser l'échelle de spacing** — ~~Actuellement ad-hoc.~~ Tokens `SP` créés (xs:4, sm:8, md:12, lg:16, xl:20, xxl:24, xxxl:32). Appliqués aux composants clés : Modal, Field, Card, CardHeader, SmallBtn. Le reste du code peut migrer progressivement.

### 1.2 Typographie
- [x] `[P1]` **Créer une échelle typographique** — ~~10 tailles.~~ Tokens `FS` créés (xs:10, sm:11, base:12, md:13, lg:15, xl:18, xxl:22). Appliqués aux composants clés. Token `LH` pour line-height (tight:1.2, normal:1.4, relaxed:1.6).
- [x] `[P2]` **Harmoniser les line-height** — ~~Entre 1.0 et 1.9.~~ LH global défini à 1.4 via CSS `*`. Tokens `LH.tight`, `LH.normal`, `LH.relaxed` utilisés dans Modal, Field, Card.
- [ ] `[P2]` **Harmoniser les letter-spacing** — Certains headers ont -0.3 à -0.5px. Supprimer ou uniformiser.

### 1.3 Couleurs & contraste
- [x] `[P1]` **Rehausser le contraste des textes secondaires** — TX3 passé de #767672 à **#656560** (ratio ~4.5:1 sur SB). WCAG AA conforme.
- [x] `[P2]` **Harmoniser les gris inactifs** — #A3A39D remplacé par TX3, #B0AFA9 remplacé par #8A8A85, DIST rehaussé à #8A8A85. Plus de gris orphelins.

### 1.4 Tokens complémentaires (ajouté)
- [x] `[P2]` **Radius scale** — Tokens `RAD` créés (sm:6, md:8, lg:10, xl:12, xxl:14, full:50%). Appliqués à Modal, Field.
- [x] `[P2]` **prefers-reduced-motion** — Ajouté dans le CSS global. Les utilisateurs sensibles aux animations ont un recours.

---

## 2. HEADER / TOPBAR

### 2.1 Structure
- [x] `[P1]` **Ajouter un bouton retour** — Flèche retour ajoutée dans la topbar quand l'utilisateur est dans une vue profonde (notes, plan, résultat, documents, checklists, planning). Ramène à l'overview.
- [ ] `[P2]` **Ajouter un breadcrumb compact** — Format : Projet > Notes ou Projet > PV n°5. Permet de situer l'utilisateur.

### 2.2 Notification
- [x] `[P2]` **Badge count sur la cloche** — Le dot remplacé par un vrai badge numérique (incluant les invitations). Affiche "9+" au-delà de 9.
- [ ] `[P3]` **Marquer les notifications comme lues au clic** — Feedback visuel insuffisant quand on lit une notification.

### 2.3 Responsive
- [x] `[P1]` **Contexte projet sur mobile** — Le nom du projet reste visible sur mobile (tronqué à 140px). La search pill est masquée, le nom et la vue courante restent affichés.

### 2.4 Divers (ajouté)
- [x] `[P2]` **Search pill en français** — "Search for anything here..." remplacé par "Rechercher..." + couleur alignée sur TX3.
- [x] `[P2]` **Tokens design appliqués au header** — spacing, radius, font-size migrés vers SP/FS/RAD.

---

## 3. SIDEBAR

### 3.1 Navigation
- [x] `[P2]` **Highlight du "Tableau de bord"** — État actif ajouté (fond blanc, ombre, icône + texte en accent) quand view === "stats".
- [x] `[P2]` **Collapse all/expand all** — Bouton chevron à côté du label "PROJETS" en mode client. Toggle entre tout replier / tout déplier. Visible uniquement avec 2+ groupes clients.

### 3.2 Projet items
- [x] `[P2]` **Tooltip au survol** — `title` natif ajouté sur chaque item projet : "Nom · Client · Statut · X PV". Fonctionne en mode client et en mode flat.
- [ ] `[P3]` **Drag to reorder** — Réordonner manuellement les projets dans un groupe client.

### 3.3 Mobile
- [x] `[P1]` **Swipe to dismiss** — Swipe gauche (> 60px) sur la sidebar ferme le panneau. Touch events sur le conteneur sidebar.
- [ ] `[P2]` **Bottom tab bar mobile** — En dessous de 480px, remplacer la sidebar par une navigation bottom bar (Projets, Notes, PV, Profil).

---

## 4. OVERVIEW (page projet)

### 4.1 Layout
- [x] `[P1]` **Colonne secondaire sur mobile** — Sur mobile (< 768px), un bouton "Infos projet" toggle l'affichage de la colonne secondaire. Repliée par défaut pour éviter le scroll excessif. Sur desktop, toujours visible.
- [x] `[P2]` **KPI cards empilées** — Sur 480px, les KPI restent maintenant en 2x2 grid (flex: 45%) au lieu de passer en 1 colonne.

### 4.2 PV History
- [x] `[P1]` **Dernier PV — boutons PDF/Rédaction** — Le bouton "Voir" générique remplacé par deux boutons séparés : "Rédaction" (outline) et "PDF" (accent orange). Même pattern que les PvRow.
- [x] `[P2]` **Date relative** — Dates affichées en relatif ("il y a 2 sem.", "hier", "aujourd'hui") avec date absolue en tooltip au hover. Appliqué au dernier PV et aux PvRow.

### 4.3 Actions ouvertes
- [x] `[P2]` **Actions fermées** — Opacity passé de 0.45 à 0.55. Le strikethrough était déjà en place.
- [ ] `[P3]` **Filtrer les actions** — Ajouter un toggle "Ouvertes / Toutes" plutôt que tout afficher.

### 4.4 Quick Tools
- [ ] `[P2]` **Count badges** — Les badges de comptage (nb documents, lots, etc.) ne sont pas toujours visibles. Uniformiser.

---

## 5. NOTE EDITOR (rédaction des remarques)

### 5.1 Méthode de saisie
- [x] `[P1]` **Fallback navigateur sans SpeechRecognition** — Le bouton "Dicter" est désormais désactivé (opacity 0.6, cursor not-allowed) si le navigateur ne supporte pas SpeechRecognition. Message "Non supporté par ce navigateur" affiché en rouge.
- [ ] `[P2]` **Indicateur de volume micro** — Pendant la dictée, pas de feedback visuel que le micro capte du son. Ajouter une barre de niveau sonore.

### 5.2 Liste des postes
- [ ] `[P1]` **Drag to reorder postes** — Impossible de réorganiser les postes manuellement. Important pour l'architecte.
- [x] `[P2]` **Compteur de remarques par poste** — Badges de statut (ouvertes/en cours/résolues) passés de 10px à 11px (FS.sm) avec dots de 6px. Plus lisibles sur mobile.

### 5.3 Remarques
- [x] `[P1]` **Édition inline** — Déjà fonctionnelle via input directement éditable (pas de double-clic). Audit corrigé.
- [x] `[P2]` **Statut remarque** — Pills de statut passées de 10px à 11px (FS.sm) avec padding augmenté et dots de 6px. Tokens SP appliqués.
- [ ] `[P2]` **Filtrer par statut** — Pouvoir filtrer les remarques par statut (ouvert, en cours, fait) dans un poste.

### 5.4 Photos
- [ ] `[P2]` **Galerie photo** — Les thumbnails sont petites. Ajouter un mode galerie plein écran avec swipe.
- [ ] `[P3]` **Compression photo** — Compresser côté client avant upload pour réduire la taille.

---

## 6. GÉNÉRATION PV (ResultView)

### 6.1 Pendant la génération
- [x] `[P1]` **Progress bar** — Barre de progression estimée ajoutée (15% → 45% → 70% → 85% → 92%) avec transition animée. S'ajoute au-dessus des étapes existantes.
- [x] `[P2]` **Message contextuel** — Déjà en place (3 étapes : Analyse, Détection, Mise en forme). Audit corrigé.

### 6.2 Résultat
- [x] `[P2]` **Word count** — Nombre de mots affiché dans le bandeau IA ("· 342 mots") à côté du temps de génération.
- [ ] `[P2]` **Undo/Redo** — L'éditeur de texte n'a pas de Ctrl+Z visible. Ajouter des boutons undo/redo.
- [ ] `[P3]` **Comparaison** — Pouvoir comparer côte à côte le PV actuel avec le précédent.

---

## 7. ENVOI EMAIL (SendPvModal)

### 7.1 Éditeur de message
- [x] `[P2]` **Sanitization HTML** — Nettoyage côté client avant envoi : suppression des balises `<script>` et des event handlers (`onclick`, `onerror`, etc.) dans le HTML du message.

### 7.2 Steps
- [x] `[P2]` **Labels sur l'indicateur d'étapes** — Labels texte ajoutés sous chaque barre : "1. Destinataires" / "2. Aperçu". L'étape active est en accent orange + bold.

### 7.3 Aperçu
- [ ] `[P3]` **Aperçu email responsive** — L'aperçu simule un rendu desktop. Ajouter un toggle desktop/mobile pour prévisualiser sur les deux.

---

## 8. PLAN / ANNOTATIONS

### 8.1 Outils
- [x] `[P1]` **Touch targets outils** — Boutons outils passés à minHeight: 44px, icônes 16px, padding augmenté. Appliqué aux 2 éditeurs (plan + photos) et aux 3 boutons de mode (Vue/Marqueur/Dessin).
- [ ] `[P2]` **Undo multiple** — Seul "undo last" existe. Ajouter un historique d'undo/redo.

### 8.2 Marqueurs
- [x] `[P1]` **Marqueurs trop petits** — Déjà 28x28px (audit corrigé). Conformes WCAG touch target.
- [ ] `[P2]` **Légende des marqueurs** — Afficher une mini-légende qui relie chaque numéro à son poste.

### 8.3 Canvas
- [ ] `[P2]` **Pinch to zoom** — Le zoom par molette existe mais pas le pinch sur tactile. Ajouter le geste pinch.
- [ ] `[P3]` **Minimap** — Sur un plan A0, ajouter une minimap en coin pour se repérer.

---

## 9. DOCUMENTS

### 9.1 Gestion fichiers
- [x] `[P2]` **Actions condensées mobile** — Sur desktop : boutons inline (inchangé). Sur mobile (< 768px) : remplacés par un bouton "⋯" qui ouvre un dropdown contextuel avec Voir, Nouvelle version, Historique, Supprimer. Tokens SP/FS/RAD appliqués.
- [ ] `[P3]` **Preview inline** — Prévisualiser les images/PDF sans ouvrir un modal.

---

## 10. PROFIL / SETTINGS

### 10.1 Navigation
- [x] `[P2]` **Nav gauche sticky** — Déjà fonctionnel : tabs horizontaux scrollables sur mobile avec suivi de la section active via scroll observer. Audit corrigé.

### 10.2 Formulaire
- [x] `[P1]` **Validation en temps réel** — Le composant Field valide désormais en inline : email invalide (regex), téléphone trop court (< 8 car.). Bordure rouge + message d'erreur sous le champ. Indicateur `*` sur les champs requis (nom, structure).
- [ ] `[P2]` **Auto-save** — Le bouton "Enregistrer" est en bas. L'utilisateur peut oublier. Ajouter un auto-save avec indicateur "Sauvegardé" discret.

### 10.3 Signature email
- [x] `[P2]` **Sanitization** — Le HTML de la signature est nettoyé à la saisie : balises `<script>` supprimées, event handlers neutralisés. Même pattern que l'envoi email.

---

## 11. MODALS

### 11.1 Structure
- [x] `[P1]` **Focus trap** — Le focus est emprisonné dans le modal (Tab/Shift+Tab cycle entre les éléments focusables). Premier élément focalisé automatiquement à l'ouverture. Attributs `role="dialog"`, `aria-modal="true"`, `aria-label` ajoutés.
- [x] `[P1]` **Fermeture Escape** — Listener `keydown` Escape ajouté. Tous les modals passant par le composant Modal se ferment avec Escape. Bouton fermer a `aria-label="Fermer"`.
- [ ] `[P2]` **Scroll des boutons** — maxHeight 85vh peut masquer les boutons d'action en bas. Header déjà sticky ; un sticky footer nécessiterait de restructurer les children.

### 11.2 Formulaire nouveau projet
- [ ] `[P2]` **Trop de champs** — Le modal de création a 10+ champs. Séparer en 2 étapes : infos essentielles (nom, client) puis détails optionnels.

---

## 12. ÉTATS VIDES & CHARGEMENT

### 12.1 Empty states
- [x] `[P2]` **Illustrations** — Icônes nues remplacées par des icônes sur fond accent (56x56 carré arrondi ACL + icône AC). Appliqué aux empty states : documents, plan, checklists.
- [x] `[P2]` **CTA contextuel** — Boutons d'action ajoutés : "Ajouter un document" (documents vides), texte d'aide (checklists vides). Le plan avait déjà un CTA "Choisir un plan".

### 12.2 Loading
- [x] `[P1]` **Skeleton screens** — Composant `Skeleton` créé (w, h, r, mb configurables) avec animation pulse CSS. Prêt à l'emploi pour les listes.
- [ ] `[P2]` **Optimistic updates** — Les actions rapides (toggle action, changer statut) devraient mettre à jour l'UI avant la réponse serveur.

### 12.3 Erreurs
- [x] `[P1]` **Error boundary** — `ErrorBoundary` class component ajouté. Wraps l'app entière. Affiche un écran de fallback premium avec icône warning, message rassurant, bouton "Recharger la page" et détails techniques en `<details>`. Log console.error.
- [ ] `[P2]` **Toast notifications** — Les erreurs réseau devraient apparaître en toast (non bloquant) plutôt qu'en alert.

---

## 13. ANIMATIONS & TRANSITIONS

### 13.1 Performance
- [x] `[P2]` **prefers-reduced-motion** — Déjà implémenté en section 1. `@media (prefers-reduced-motion: reduce)` désactive toutes les animations.
- [ ] `[P3]` **will-change** — Ajouter `will-change: transform` sur les éléments animés fréquemment (sidebar, modals) pour le GPU compositing.

### 13.2 Micro-interactions
- [x] `[P2]` **Hover inline fragile** — Les 2 boutons method chooser (Dicter/Écrire) migrés vers classes CSS `.method-card-dictate:hover` et `.method-card-write:hover`. Inline onMouseEnter/Leave supprimés.
- [x] `[P2]` **Transitions manquantes** — Les vues principales (Overview, Stats, ResultView) avaient déjà `animation: fadeIn`. Classe `.ap-view-enter` ajoutée au CSS. Audit corrigé.

---

## 14. ACCESSIBILITÉ

### 14.1 Critique
- [x] `[P0]` **ARIA labels** — `aria-label` ajouté sur : hamburger, bouton retour, cloche notifications, recherche, avatar profil, logout. Modal déjà traité en section 11.
- [x] `[P0]` **Heading hierarchy** — `role="heading" aria-level="1"` sur le nom du projet (header). `role="heading" aria-level="2"` sur tous les CardHeader (Overview). Les lecteurs d'écran peuvent naviguer par sections.
- [x] `[P1]` **Rôles contentEditable** — `role="textbox"`, `aria-label`, `aria-multiline="true"` ajoutés sur l'éditeur de message email et l'éditeur de signature.

### 14.2 Navigation clavier
- [x] `[P1]` **Raccourcis clavier** — Ctrl/Cmd+K : recherche, Ctrl/Cmd+N : nouveau projet, Ctrl/Cmd+B : toggle sidebar. Désactivés quand un input/textarea est focalisé.
- [ ] `[P2]` **Skip to content** — Pas de lien "Aller au contenu" pour les utilisateurs clavier.

### 14.3 Visuel
- [ ] `[P2]` **Indicateurs couleur-seuls** — Les dots de statut (vert/orange/rouge) n'ont pas de fallback texte. Un daltonien ne peut pas les distinguer.

---

## 15. RESPONSIVE / MOBILE

### 15.1 Breakpoints
- [x] `[P1]` **Breakpoint tablette manquant** — Breakpoint 900px ajouté : overview et note editor passent en single-column sur tablette paysage. Transition progressive 1024 → 900 → 768.
- [x] `[P1]` **Safe area insets** — `@supports (padding: env(safe-area-inset-*))` ajouté. Header, contenu et modals respectent les encoches iPhone. `viewport-fit=cover` déjà en place dans index.html.
- [x] `[P2]` **Orientation paysage** — `@media (max-height: 500px) and (orientation: landscape)` : header compact, modals plein écran. Évite le contenu masqué sur téléphone en paysage.

### 15.2 Touch
- [x] `[P1]` **Touch targets** — Checkboxes checklists 20px → 24px. Marqueurs sidebar liste 20px → 24px. Bouton suppression photo 20px → 24px. (Les boutons via `min-height: 44px` global déjà couvert en 768px).
- [ ] `[P2]` **Pull to refresh** — Ajouter un geste pull-to-refresh sur les listes (projets, PV).
- [ ] `[P2]` **Swipe actions** — Swipe gauche sur un projet pour archiver, swipe droit pour dupliquer.

### 15.3 Performance mobile
- [ ] `[P2]` **Lazy loading** — Les vues non visibles (plan editor, checklists) sont montées en mémoire. Implémenter du code-splitting React.lazy().
- [ ] `[P3]` **Image optimization** — Aucune compression client-side des photos avant upload.

---

## RÉCAPITULATIF PAR PRIORITÉ

### P0 — Bloquant (4 items) — TOUS RÉSOLUS
1. ~~ARIA labels sur tous les boutons icône-only~~ ✅
2. ~~Heading hierarchy~~ ✅
3. ~~Rôles sur contentEditable~~ ✅
4. ~~Error boundary React~~ ✅

### P1 — Important — 17/20 résolus
- ✅ Standardiser l'échelle de spacing (tokens SP)
- ✅ Créer l'échelle typographique (tokens FS/LH)
- ✅ Contraste textes secondaires (TX3 rehaussé)
- ✅ Bouton retour dans le header
- ✅ Contexte projet sur mobile
- ✅ Swipe to dismiss sidebar
- ✅ Colonne secondaire mobile (accordion)
- ✅ Dernier PV : boutons Rédaction/PDF
- ✅ Fallback SpeechRecognition
- ✅ Progress bar génération PV
- ✅ Focus trap modals
- ✅ Fermeture Escape modals
- ✅ Skeleton screens (composant prêt)
- ✅ Error boundary
- ✅ Validation temps réel profil
- ✅ Touch targets augmentés
- ✅ Safe area insets iPhone
- ✅ Breakpoint tablette (900px)
- ⬜ Drag to reorder postes
- ⬜ Raccourcis clavier avancés (Ctrl+S save)

### P2 — Amélioration — 25/35 résolus
Voir les ✅ dans chaque section ci-dessus.

### P3 — Nice-to-have — Backlog
- Drag to reorder projets
- will-change GPU compositing
- Preview inline documents
- Minimap plan A0
- Comparaison PV côte à côte
- Aperçu email responsive
- Image optimization client-side
- Pull to refresh
- Swipe actions projets
