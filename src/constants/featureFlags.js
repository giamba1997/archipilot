// Source unique de vérité du périmètre POC.
// DEFER = masqué derrière un flag (code/tables/migrations conservés). Passer à `true`
// pour rallumer une feature en fast-follow après le lancement solo.
export const FEATURES = {
  collaboration:   false, // CollabModal, project_members, "Partagés avec moi"
  invoices:        false, // InvoicesView, onglet Factures, KPI CA
  opr:             false, // OprView + signatures + réserves formelles (collapse réserves)
  permits:         true,  // PermitsView (suivi permis) — refonte v2 activée
  quotes:          false, // QuotesView (comparaison devis), parse-quote
  progressReports: false, // ProgressReportsView (rapports MO), generate-progress-report
  cdcParsing:      false, // CdcStructureModal / CdcBanner / parse-cdc (extraction structurée)
  planning:        false, // PlanningView / PlanningDashboard / Gantt / lots
  timesheets:      false, // TimesheetView (vue d'agrégation ; le timer de visite reste actif)
  map:             false, // MapDashboardView
};

export const isEnabled = (k) => FEATURES[k] === true;
