// Source unique de vérité du périmètre POC.
// DEFER = masqué derrière un flag (code/tables/migrations conservés). Passer à `true`
// pour rallumer une feature en fast-follow après le lancement solo.
// Toutes les features sont actives : on ne masque plus rien derrière des flags
// (décision produit — éviter la confusion des points d'entrée « morts »).
// Le mécanisme reste en place (isEnabled) si on doit re-différer une feature.
export const FEATURES = {
  collaboration:   true, // CollabModal, project_members, "Partagés avec moi"
  invoices:        true, // InvoicesView, onglet Factures, KPI CA
  opr:             true, // OprView + signatures + réserves formelles
  permits:         true, // PermitsView (suivi permis)
  quotes:          true, // QuotesView (comparaison devis), parse-quote
  progressReports: true, // ProgressReportsView (états d'avancement MO)
  cdcParsing:      true, // CdcStructureModal / CdcBanner / parse-cdc
  planning:        true, // PlanningView / PlanningDashboard / Gantt / lots
  timesheets:      true, // TimesheetView (agrégation ; timer de visite déjà actif)
  map:             true, // MapDashboardView
};

export const isEnabled = (k) => FEATURES[k] === true;
