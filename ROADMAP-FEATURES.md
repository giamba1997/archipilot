# ROADMAP ArchiPilot — Features futures

Document de travail listant les features identifiées comme prochaines étapes
prioritaires. Chaque entrée contient le « pourquoi », le « quoi » fonctionnel
et le « comment » technique pour pouvoir reprendre directement le chantier
sans avoir à tout reconceptualiser.

Classé par impact métier décroissant (tier 1 = revenu / obligatoire,
tier 3 = polish / différenciation).

---

## TIER 1 — Revenus & paperasse obligatoire

### F1. Honoraires & facturation par phases

**Pourquoi.** Les archis belges sont payés en tranches indexées sur les
phases du projet (esquisse, AVP, permis, exécution, chantier, réception).
Aujourd'hui, ArchiPilot gère les phases mais aucune passerelle vers la
facturation : l'archi sort Excel + Word manuellement. Énorme manque.

**Quoi (fonctionnel).**
- Pour chaque phase d'un projet : montant prévu, % du total, date prévue
  de facturation, statut (à facturer / facturé / payé / en retard)
- Génération automatique de la facture en PDF aux couleurs du cabinet
  (réutilise `pdf.js` + le système de templates déjà en place pour les PV)
- Numérotation automatique conforme TVA belge (séquentielle par année,
  format `2026-001`)
- Envoi de la facture par email (réutilise `send-pv-email` avec un nouveau
  `kind: "invoice"`)
- Tableau de bord cross-projets : « À facturer ce mois », « En retard de
  paiement », CA prévu vs réalisé
- Relances automatiques J+30, J+60, J+90 (template email + log)

**Comment (technique).**

DB — nouvelle migration `010_invoicing.sql` :
```sql
CREATE TABLE invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE NULL,
  project_id      text NOT NULL,
  phase_id        text NOT NULL,           -- depuis project.phases[]
  number          text NOT NULL UNIQUE,    -- ex "2026-001"
  client_name     text NOT NULL,
  client_address  text,
  client_vat      text,                    -- TVA cliente si pro
  description     text NOT NULL,
  amount_ht       numeric(10,2) NOT NULL,
  vat_rate        numeric(4,2) DEFAULT 21, -- 21% standard, 6% rénovation
  amount_vat      numeric(10,2) GENERATED ALWAYS AS (amount_ht * vat_rate / 100) STORED,
  amount_ttc      numeric(10,2) GENERATED ALWAYS AS (amount_ht * (1 + vat_rate / 100)) STORED,
  issue_date      date NOT NULL,
  due_date        date NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  sent_at         timestamptz,
  paid_at         timestamptz,
  payment_method  text,                    -- "virement", "stripe", etc.
  pdf_url         text,
  reminder_count  int DEFAULT 0,
  last_reminder_at timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_owner    ON invoices(owner_user_id);
CREATE INDEX idx_invoices_project  ON invoices(project_id);
CREATE INDEX idx_invoices_status   ON invoices(status, due_date);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
-- Policies : owner CRUD ; org members read si org_id matches.
```

Phases enrichies (côté JSONB `project.phases[]`) :
```js
{
  id: "permit",
  label: "Permis",
  order: 3,
  expectedAmount: 8000,    // ← nouveau
  expectedPercent: 25,     // ← nouveau (% du total honoraires projet)
  expectedDate: "2026-09-15",  // ← nouveau
  invoiceId: null,         // ← nouveau, lié à invoices.id quand généré
}
```

Edge Functions :
- `generate-invoice-pdf` : génère le PDF facture (peut être client-side
  via jsPDF mais centralisé pour la numérotation atomique)
- `send-invoice-email` : envoie facture par Resend (template HTML pro)
- Cron Edge Function `invoice-reminders` (déclenché quotidiennement
  via `pg_cron` ou Supabase Scheduled Functions) : balaye les invoices
  en `sent` avec `due_date < now()` et envoie relance + incrémente
  `reminder_count`. Crée notif cloche `invoice_overdue`.

UI :
- Nouvel onglet **« Honoraires »** dans la vue projet (entre PV et
  Documents probablement)
- Modal `InvoiceEditModal` : créer/éditer facture
- Vue dashboard cross-projets `InvoicingDashboard` : KPI CA mois /
  trimestre / année + liste des factures impayées triées par retard
- Composant `PhaseInvoicePill` dans la sidebar phase : statut visuel
  (gris=non facturé, ambre=facturé, vert=payé, rouge=en retard)

Intégrations optionnelles V2 :
- **Stripe / Mollie** : génère un lien de paiement intégré à la facture
  pour CB / Bancontact. Webhook met `status='paid'` automatiquement.
- **Codabox / Pontalis** : import de relevés bancaires pour matching
  automatique paiement → facture (gros gain mais complexe).

Effort estimé : **15-20h** pour la version sans intégration paiement,
**30-40h** avec Stripe/Mollie + matching bancaire.

Dépendances : aucune bloquante. Autonome.

---

### F2. Journal de chantier

**Pourquoi.** Le journal de chantier est **légalement obligatoire**
en Belgique pour tout chantier soumis au RGPT (Règlement Général pour
la Protection du Travail) — soit la grande majorité des chantiers
construction/rénovation. Doit lister chaque visite : date, heure,
présents, observations, décisions, photos. C'est aussi la première
pièce demandée en cas de litige ou de contrôle Cnac.

Aujourd'hui ArchiPilot a déjà toutes les données (PV de chantier +
photos timestampées + sessions de temps + tâches), il manque
**juste l'agrégation** sous forme journal + génération PDF
chronologique.

**Quoi (fonctionnel).**
- Vue chronologique unique « Journal » par projet
- Pour chaque entrée : date, présents (depuis participants), résumé
  (auto depuis PV ou saisie libre), photos liées, décisions
- Génération PDF du journal complet (pour archivage / audit Cnac)
- Signature électronique de l'archi (attestation de véracité)
- Filtrage par période / par auteur

**Comment (technique).**

Pas de nouvelle table nécessaire — on dérive depuis l'existant :
- `pvHistory[]` → entrées principales (réunions de chantier)
- `gallery[]` (photos avec `date`) → entrées photo seules
- `actions[]` avec `createdAt` + `who` → entrées décisions
- Sessions de temps `timeSessions[]` → entrées présence

Possible nouvelle table `chantier_log_entries` pour les **entrées
manuelles libres** que l'archi ajoute (visite seule sans PV) :
```sql
CREATE TABLE chantier_log_entries (
  id           uuid PRIMARY KEY,
  owner_user_id uuid REFERENCES auth.users(id),
  project_id   text NOT NULL,
  entry_date   date NOT NULL,
  entry_time   time,
  authors      text[],            -- noms des présents
  observation  text NOT NULL,
  photos       text[],            -- urls
  weather      text,              -- bonus : météo automatique via API
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

Composant `JournalView.jsx` (nouvel onglet projet) :
- Timeline verticale chronologique inversée
- Couleur du dot par type d'entrée (PV=ambre, photo=bleu, action=violet,
  manuel=gris)
- Click sur entrée → détail dans drawer latéral
- Bouton **« Ajouter une entrée libre »** pour visites sans PV

Génération PDF (nouveau dans `utils/pdf.js`) :
```js
export async function generateChantierJournalPdf(project, profile, options) {
  // Header projet + cabinet
  // Tableau chronologique : Date | Type | Présents | Observations | Photos
  // Footer : signature électronique archi + horodatage SHA-256 du contenu
}
```

Filigrane optionnel « PROJET DE JOURNAL — VERSION DU {date} » pour
distinguer une copie de travail d'une copie signée définitive.

Effort estimé : **8-12h**. Beaucoup de réutilisation de l'existant.

Dépendances : aucune.

---

### F3. Comparaison de devis (soumissions)

**Pourquoi.** Quand l'archi reçoit 3 à 5 devis pour le même lot
(maçonnerie, électricité, etc.), il les compare manuellement en
recopiant chaque poste dans un Excel. Très chronophage et source
d'erreurs. C'est un cas d'usage où l'IA peut briller.

**Quoi (fonctionnel).**
- Upload de N PDF de devis pour un même lot
- IA extrait automatiquement chaque poste (description, quantité,
  unité, PU HT, total HT, conditions de paiement, délais)
- Tableau de comparaison côte à côte par poste
- Highlighting automatique des écarts importants (> 20% par exemple)
- Recommandation IA finale (« Le devis B est 18% moins cher mais
  ne couvre pas le poste 3.2 »)
- Signalement d'oublis (poste présent chez 2/3 entreprises mais pas
  la 3e)
- Choix d'un devis → bascule en `awarded` → crée le contractor
  associé au lot

**Comment (technique).**

DB — nouvelle migration `011_quotes.sql` :
```sql
CREATE TABLE quotes (
  id            uuid PRIMARY KEY,
  owner_user_id uuid REFERENCES auth.users(id),
  project_id    text NOT NULL,
  lot_id        text,
  contractor_name text NOT NULL,
  contractor_email text,
  file_url      text NOT NULL,
  total_ht      numeric(10,2),
  total_ttc     numeric(10,2),
  validity_days int,
  parsed_items  jsonb,    -- [{ code, description, qty, unit, unit_price, total, group }]
  ai_summary    text,     -- résumé / points d'attention
  status        text DEFAULT 'pending'
                CHECK (status IN ('pending','awarded','rejected')),
  awarded_at    timestamptz,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);
```

Edge Function `parse-quote` :
- Reçoit le PDF en base64
- Utilise OpenAI Vision (gpt-4-vision ou gpt-4o) pour extraire
  les postes en JSON structuré
- Prompt strict : retourner array d'items avec `description`,
  `quantity`, `unit`, `unit_price_ht`, `total_ht`, `category`
- Tolérance erreurs : retourner les postes même si certains champs
  manquent
- Stocke résultat dans `quotes.parsed_items`

UI :
- Nouvelle section **« Devis »** dans le détail d'un lot
- Drag-and-drop PDF (réutilise les patterns d'`ImportProjectWizard`)
- Vue comparative : tableau matriciel, postes en lignes,
  entreprises en colonnes
- Tooltips IA sur les écarts (« +35% par rapport à la moyenne »)
- Bouton « Choisir cette offre » → bascule status `awarded` +
  enregistre `contractor` du lot

Effort estimé : **12-16h**.

Dépendances : feature lots existante (déjà en place).

---

## TIER 2 — Gain de temps & différenciation

### F4. Suivi des permis d'urbanisme

**Pourquoi.** Le permis d'urbanisme est l'étape la plus stressante
d'un projet : plusieurs mois d'attente, courriers de la commune
demandant des compléments, délais légaux à respecter, recours possibles.
Tracker tout ça dans un email + post-it = enfer. Personne ne le fait
bien.

**Quoi (fonctionnel).**
- Pour chaque projet : créer un dossier permis avec statut
  (en préparation → déposé → en instruction → demande compléments →
  octroyé / refusé / recours)
- Date de dépôt commune + date AR + date limite de décision (calculée
  automatiquement selon la procédure : 30, 75, 105, 230 jours)
- Notifications J-30, J-7, J-1 avant échéance
- Alerte « silence vaut acceptation/refus » quand délai dépassé
- Upload des documents (formulaire, plans, AR commune, demandes
  de compléments, décision finale)
- Timeline visuelle du parcours

**Comment (technique).**

DB — nouvelle migration `012_permits.sql` :
```sql
CREATE TABLE permits (
  id              uuid PRIMARY KEY,
  owner_user_id   uuid REFERENCES auth.users(id),
  project_id      text NOT NULL,
  permit_type     text NOT NULL
                  CHECK (permit_type IN ('urbanisme','env','mixte','enseigne','demolition')),
  procedure       text NOT NULL
                  CHECK (procedure IN ('30j','75j','105j','230j','autres')),
  reference       text,                    -- numéro dossier commune
  commune         text,
  depot_date      date,
  ar_date         date,
  deadline_date   date,                    -- calculée automatiquement
  decision_date   date,
  status          text NOT NULL DEFAULT 'preparation'
                  CHECK (status IN ('preparation','deposited','complete_request','in_review','granted','refused','recourse','expired')),
  decision_text   text,
  documents       jsonb DEFAULT '[]'::jsonb,  -- [{name, url, type, uploaded_at}]
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

Logique de calcul `deadline_date` (depuis `ar_date` ou `depot_date`) :
- 30 jours pour modifications mineures
- 75 jours pour permis simple
- 105 jours pour permis avec consultation
- 230 jours pour permis avec EIE (étude d'incidence)

Cron Edge Function `permit-deadline-watcher` (quotidien) :
- Pour chaque permit `in_review` ou `complete_request`
- Calcule jours restants avant `deadline_date`
- Si J-30 / J-7 / J-1 → insert notification + email digest
- Si dépassé → status auto vers `expired` + notif urgente

UI :
- Onglet **« Permis »** dans le projet (visible uniquement si statut
  permis ou exécution)
- Formulaire de dépôt avec champs guidés (procédure → calcul auto délai)
- Timeline visuelle : Préparation → Dépôt → AR → Instruction →
  Décision avec horodatages
- Widget urgences sur dashboard global : « 3 permis approchent leur
  échéance »

Effort estimé : **10-14h**.

Dépendances : système notifications cloche (déjà fait).

---

### F5. Alerts & rappels intelligents

**Pourquoi.** L'app a la cloche et la subscription realtime, mais
aucune alerte automatique scheduled. Conséquence : l'archi doit
penser à tout (réception définitive J-365, échéances réserves,
permis à relancer). Big perceived value avec peu d'effort technique.

**Quoi (fonctionnel).**
Règles d'alertes auto à coder :

1. **Réception définitive J-30** : 12 mois après une OPR provisoire
   diffusée, alerte « Planifie la réception définitive de {projet} »
2. **Réserve échéance dépassée** : `r.deadline < today` et
   `r.status !== "levee"` → notif J+0, J+7, J+14
3. **Permis silence vaut quoi** : J-7, J-1, J+0 avant `deadline_date`
4. **Tâche overdue** : tâches avec `dueDate < today` et statut
   non-clos
5. **Facture impayée** : invoice `sent` avec `due_date + 30j` dépassé
   → alerte + email auto au client (cf F1)
6. **Pas de PV depuis X temps** : projet en `construction` sans
   nouveau PV depuis 30j → suggère « planifier réunion »

**Comment (technique).**

Pas de nouvelle table — on insère dans `notifications` existante.

Cron Edge Function `daily-reminders` (déclenchée chaque jour 8h00) :
```ts
// Pour chaque user actif :
//   - SELECT projects, opr, reserves, permits, invoices, tasks
//   - Applique chaque règle
//   - INSERT notifications (avec dédup pour éviter spam)
//   - Optionnel : envoie 1 email digest par jour si user.alert_email_digest = true
```

Setup cron via Supabase Scheduled Functions OR `pg_cron` :
```sql
SELECT cron.schedule(
  'daily-reminders',
  '0 8 * * *',
  $$ SELECT net.http_post('https://.../functions/v1/daily-reminders', ...) $$
);
```

Préférence utilisateur (nouveau champ `profile.alert_settings` JSONB) :
```json
{
  "reception_definitive": true,
  "reserve_overdue": true,
  "permit_deadline": true,
  "task_overdue": false,
  "invoice_overdue": true,
  "no_pv_30d": false,
  "email_digest": true,
  "email_digest_time": "08:00"
}
```

UI :
- Page Profil → section « Alertes » avec toggles par type
- Bouton « Voir mes prochaines échéances » qui ouvre un drawer
  agrégeant tous les triggers actifs

Effort estimé : **8-10h**.

Dépendances : F1 (factures) et F4 (permis) si on veut couvrir tous
les triggers, mais on peut commencer avec les triggers existants
(réserves, OPR, tâches).

---

### F6. Communication unifiée client

**Pourquoi.** L'archi reçoit des comm' client par 5 canaux : email
perso, email pro, SMS, WhatsApp, téléphone. Pour retrouver « qu'a-t-il
dit en juin sur ce sujet ? », il fouille manuellement chaque canal.
Solution : centraliser tout dans un thread unique par projet.

**Quoi (fonctionnel).**
- Chaque projet a une **adresse email magique** unique
  `projet-{id}-{hash}@archipilot.app`
- Le client (ou l'archi) forwarde ses emails vers cette adresse →
  ils apparaissent automatiquement dans le thread du projet
- Vue chat-like par projet : timeline des messages, qui a écrit, quand
- Réponse possible directement depuis l'app
- Indexation searchable du contenu

**Comment (technique).**

DB — `013_communications.sql` :
```sql
CREATE TABLE project_communications (
  id            uuid PRIMARY KEY,
  owner_user_id uuid REFERENCES auth.users(id),
  project_id    text NOT NULL,
  channel       text NOT NULL
                CHECK (channel IN ('email','sms','manual','call_log')),
  direction     text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_address  text,
  to_addresses  text[],
  subject       text,
  body_text     text,
  body_html     text,
  attachments   jsonb DEFAULT '[]'::jsonb,
  thread_id     text,                  -- pour grouper les conversations
  external_id   text,                  -- Mailgun/Postmark message ID
  received_at   timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_proj_comms_project ON project_communications(project_id, received_at DESC);
CREATE INDEX idx_proj_comms_thread ON project_communications(thread_id);
-- FTS index optional pour recherche
CREATE INDEX idx_proj_comms_search ON project_communications USING gin(to_tsvector('french', body_text));
```

Webhook Edge Function `inbound-email` :
- Reçoit POST de **Postmark** ou **Mailgun** (services qui parsent
  les emails entrants et envoient en webhook structuré)
- Parse `to` pour extraire `project_id` (regex sur l'adresse magique)
- Vérifie le hash de sécurité (sinon rejette)
- INSERT dans `project_communications`
- Insert notif cloche pour l'archi : `comm_received`

Configuration DNS :
- MX record sur `*.inbound.archipilot.app` → Postmark inbound server
- Postmark → webhook vers Edge Function

Outbound :
- Edge Function `send-project-email` (réutilise infrastructure Resend)
- Insert dans `project_communications` côté outbound

UI :
- Nouvel onglet **« Communications »** dans le projet
- Timeline chat-like (style Discord / Slack)
- Filtre par canal / par participant
- Recherche full-text dans le thread
- Bouton « Répondre » → modal d'envoi

Considération : **GDPR** + **secret professionnel**. Les emails du
client transitent par notre système. Besoin de mention légale
explicite + chiffrement at rest.

Effort estimé : **20-30h** (gros chantier — DNS, webhook, UI complète).

Dépendances : compte Postmark / Mailgun (~10-30€/mois).

---

## TIER 3 — Polish & expérience

### F7. Mode offline robuste

**Pourquoi.** Sur chantier, le réseau 4G est aléatoire. Ouvrir un PV,
ajouter une réserve, prendre une photo → si pas de réseau, l'archi
perd ses données ou doit attendre. La PWA actuelle marche mais la
synchro est limitée.

**Quoi (fonctionnel).**
- Ouverture de l'app hors-ligne : tous les projets récents sont
  accessibles en lecture
- Création/modification de réserves, photos, sessions de temps en
  hors-ligne
- File d'attente locale (IndexedDB) des opérations en attente
- Sync automatique au retour online avec resolution de conflits
  basique (last-write-wins ou prompt si conflit)
- Indicateur visuel « En attente de sync » sur les éléments

**Comment (technique).**

Côté Service Worker (déjà en place via Vite-PWA) :
- Étendre `workbox` pour intercepter les writes API
- Stratégie : `NetworkFirst` pour reads, `Background Sync` pour writes
- IndexedDB pour stockage local des projets + queue d'opérations

Nouveau module `src/utils/offlineQueue.js` :
```js
// Wrapper autour des écritures DB
// Si online : write direct via supabase
// Si offline : push dans IndexedDB queue + write optimiste local
// Au retour online : flush queue avec retry exponentiel
```

État UI :
- Petit badge en topbar : ● vert (online) / ● ambre (offline) / ●
  bleu (syncing N items)
- Sur chaque élément créé offline : icône cloud-pending

Effort estimé : **15-20h** (complexité de la sync + edge cases).

Dépendances : aucune.

---

### F8. Bibliothèque de réserves types

**Pourquoi.** Quand un archi visite le chantier, il constate des
défauts récurrents : « joint silicone manquant en cuisine », « peinture
éclatée plinthe couloir », « trace humidité plafond chambre ». Saisie
manuelle x100 = horrible. Une bibliothèque pré-définie qu'il enrichit
au fil des projets = grosse productivité.

**Quoi (fonctionnel).**
- Liste personnelle (par user) ou partagée (par org) de réserves
  types : description, sévérité par défaut, contractor type associé
- Au moment d'ajouter une réserve : auto-complete sur la description
  qui propose les réserves types
- Click → préremplit le form
- Possibilité de favoris / récents

**Comment (technique).**

DB — `014_reserve_templates.sql` :
```sql
CREATE TABLE reserve_templates (
  id            uuid PRIMARY KEY,
  owner_user_id uuid REFERENCES auth.users(id),
  org_id        uuid REFERENCES organizations(id) NULL,
  description   text NOT NULL,
  default_severity text DEFAULT 'major'
                  CHECK (default_severity IN ('critical','major','minor','cosmetic')),
  default_contractor_type text,    -- "Maçonnerie", "Électricité", etc.
  category      text,              -- groupement
  usage_count   int DEFAULT 0,     -- pour tri par fréquence
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Bibliothèque commune (seed) pré-remplie : ~50 réserves classiques
INSERT INTO reserve_templates (description, default_severity, category) VALUES
  ('Joint silicone manquant ou défaillant', 'minor', 'Finitions'),
  ('Peinture éclatée ou écaillée', 'cosmetic', 'Finitions'),
  ('Carrelage fissuré ou cassé', 'major', 'Sol'),
  ('Trace d''humidité visible', 'major', 'Étanchéité'),
  ...
```

UI :
- Dans `OprView ReserveForm`, autocomplete sur le champ description
  (déjà partiellement présent via `<datalist>` pour les contractors)
- Liste des suggestions triée par : 1. usage_count 2. correspondance
  textuelle
- Bouton « Sauvegarder comme modèle » dans le form
- Page **« Ma bibliothèque »** dans Profil pour CRUD

Effort estimé : **4-6h**.

Dépendances : aucune.

---

### F9. Multi-projets sur carte

**Pourquoi.** Un archi avec 15 chantiers en cours doit planifier ses
visites de la journée. Aujourd'hui : Google Maps + manuel. Une vue
carte avec pins par projet permet de grouper géographiquement.

**Quoi (fonctionnel).**
- Vue carte (Bruxelles / Belgique par défaut)
- Pin par projet, couleur selon statut (esquisse, chantier, réception…)
- Click pin → drawer latéral avec infos rapides + bouton « Ouvrir »
- Filtres : statut, phase, priorité
- Bonus : bouton « Itinéraire de la journée » qui calcule l'ordre
  optimal des visites prévues

**Comment (technique).**

Choix techno :
- **Mapbox GL JS** : qualité supérieure mais payant au-delà de 50k
  loads/mois
- **Leaflet + OpenStreetMap** : gratuit, suffisant pour l'usage

Geocoding :
- Edge Function `geocode-project` : prend `project.address` →
  appelle Nominatim (OSM, gratuit, rate-limited) ou Google Geocoding API
  → cache `lat`/`lng` dans `project.geo` JSONB
- Trigger : à chaque save de l'adresse projet

UI :
- Nouvelle vue `MapDashboardView` accessible depuis sidebar dashboard
- Composant `<ProjectMap projects={...} onSelect={...} />`
- Sidebar à droite : liste filtrable des projets visibles sur la carte

Effort estimé : **8-10h** (Leaflet + geocoding + UI).

Dépendances : aucune.

---

### F10. Reporting client automatique

**Pourquoi.** Le MO veut un point d'avancement régulier sur son
chantier. Aujourd'hui l'archi rédige manuellement un email mensuel
avec photos + résumé des PV. Génération auto = gain de temps massif.

**Quoi (fonctionnel).**
- Tous les X jours (configurable par projet : 7/15/30j), génération
  automatique d'un rapport d'avancement
- Contenu auto :
  - Photos prises depuis le dernier rapport (max 12 best-of)
  - Résumé des PV de la période (synthèse IA)
  - Avancement % du planning
  - Réserves ouvertes / levées
  - Prochaines étapes (depuis tâches / planning)
- Export PDF + envoi automatique au MO si opt-in
- Brouillon que l'archi peut éditer avant envoi

**Comment (technique).**

DB — `015_progress_reports.sql` :
```sql
CREATE TABLE progress_reports (
  id            uuid PRIMARY KEY,
  owner_user_id uuid REFERENCES auth.users(id),
  project_id    text NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  content_html  text,
  pdf_url       text,
  status        text DEFAULT 'draft'
                CHECK (status IN ('draft','reviewed','sent')),
  sent_at       timestamptz,
  sent_to       text[],
  generated_at  timestamptz NOT NULL DEFAULT now()
);
```

Cron Edge Function `weekly-progress-reports` :
- Pour chaque projet avec `progress_report_frequency = "weekly"` etc.
- Collecte data (photos, PVs, tâches…)
- Appelle OpenAI pour synthèse
- INSERT progress_report en `draft`
- Notif cloche : `progress_report_ready`
- Si user a coché auto-send : `status='sent'` + email au MO

Réutilise `pdf.js` pour le PDF (template dédié).

UI :
- Section dédiée dans onglet Résumé / nouveau onglet Rapports
- Édition WYSIWYG du brouillon
- Aperçu avant envoi
- Historique des rapports envoyés

Effort estimé : **12-16h**.

Dépendances : aucune (mais quotas IA à considérer pour Free).

---

## Synthèse priorisation

| # | Feature | Tier | Effort | ROI utilisateur |
|---|---|---|---|---|
| F1 | Honoraires & facturation | 1 | 15-20h | 🔴🔴🔴🔴🔴 |
| F2 | Journal de chantier | 1 | 8-12h | 🔴🔴🔴🔴 (légal) |
| F3 | Comparaison de devis | 1 | 12-16h | 🔴🔴🔴 |
| F4 | Permis d'urbanisme | 2 | 10-14h | 🔴🔴🔴 |
| F5 | Alerts & rappels | 2 | 8-10h | 🔴🔴🔴🔴 (perçu) |
| F6 | Communication unifiée | 2 | 20-30h | 🔴🔴 |
| F7 | Offline robuste | 3 | 15-20h | 🔴🔴 |
| F8 | Bibliothèque réserves | 3 | 4-6h | 🔴🔴🔴 |
| F9 | Carte multi-projets | 3 | 8-10h | 🔴🔴 |
| F10 | Rapports clients auto | 3 | 12-16h | 🔴🔴🔴 |

**Recommandation 1er sprint (~40h)** :
1. F5 (alerts) — quick win très visible
2. F8 (bibliothèque réserves) — quick win productivité
3. F2 (journal de chantier) — argument de vente légal

**Recommandation 2e sprint (~50h)** :
1. F1 (honoraires) — directement sur le revenu
2. F3 (comparaison devis) — différenciation IA forte

---

## Tracking

À utiliser comme TODO list à cocher quand on attaque chacune. Garder
le doc à jour en notant les choix architecturaux qu'on prend en route.
