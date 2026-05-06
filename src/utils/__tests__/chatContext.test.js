import { describe, it, expect } from "vitest";
import { buildChatContext } from "../chatContext";

describe("buildChatContext", () => {
  it("renders empty state when no projects", () => {
    const ctx = buildChatContext({ projects: [], profile: { name: "Test" } });
    expect(ctx).toContain("aucun projet actif");
  });

  it("includes user header with name and structure", () => {
    const ctx = buildChatContext({
      projects: [],
      profile: { name: "Gaëlle CNOP", structure: "DEWIL architecten" },
    });
    expect(ctx).toContain("Gaëlle CNOP");
    expect(ctx).toContain("DEWIL architecten");
  });

  it("renders project meta and counts actions", () => {
    const project = {
      id: 1,
      name: "Hall 6",
      client: "SNCB",
      contractor: "LAURENTY",
      city: "Bruxelles",
      statusId: "construction",
      actions: [
        { id: 1, text: "Reprise EI 30", open: true, urgent: true, who: "Entr." },
        { id: 2, text: "Plans validation", open: true, urgent: false, who: "MO" },
        { id: 3, text: "Closed item", open: false, urgent: false },
      ],
    };
    const ctx = buildChatContext({ projects: [project] });
    expect(ctx).toContain("Hall 6");
    expect(ctx).toContain("SNCB");
    expect(ctx).toContain("LAURENTY");
    expect(ctx).toContain("2 ouvertes");
    expect(ctx).toContain("1 urgente");
    expect(ctx).toContain("1 clôturée");
    expect(ctx).toContain("Reprise EI 30");
  });

  it("excludes archived projects from main listing", () => {
    const projects = [
      { id: 1, name: "Active project" },
      { id: 2, name: "Old project", archived: true },
    ];
    const ctx = buildChatContext({ projects });
    expect(ctx).toContain("# Projets actifs");
    expect(ctx).toContain("Active project");
    expect(ctx).toContain("# Projets archivés");
    expect(ctx).toContain("Old project");
    // The header section should mention only 1 active
    const synthese = ctx.match(/# Synthèse[\s\S]*?(?=\n# |$)/);
    expect(synthese?.[0]).toContain("1 projet");
  });

  it("aggregates time sessions per project", () => {
    const now = new Date();
    const projects = [{
      id: 1,
      name: "Test",
      timeSessions: [
        { id: 1, startedAt: now.toISOString(), endedAt: now.toISOString(), durationSeconds: 3600 },
        { id: 2, startedAt: now.toISOString(), endedAt: now.toISOString(), durationSeconds: 1800 },
      ],
    }];
    const ctx = buildChatContext({ projects });
    expect(ctx).toContain("Temps passé");
    expect(ctx).toContain("2 sessions");
  });

  it("strips markdown from PV excerpts", () => {
    const projects = [{
      id: 1,
      name: "Test",
      pvHistory: [
        { number: 1, date: "01/05/2026", status: "draft", excerpt: "**PROJET:** Test\n### Sous-section" },
      ],
    }];
    const ctx = buildChatContext({ projects });
    // The excerpt itself should be clean (no ** or markdown headers leaked
    // through). The `###` used for section structure of the context itself
    // is allowed — only the user-content excerpts are stripped.
    expect(ctx).toContain("PV n°1 (draft)");
    expect(ctx).not.toContain("**PROJET:**");
    expect(ctx).not.toContain("### Sous-section");
  });

  it("limits old PVs to a count line", () => {
    const projects = [{
      id: 1,
      name: "Test",
      pvHistory: Array.from({ length: 12 }, (_, i) => ({
        number: i + 1,
        date: `0${(i % 9) + 1}/01/2026`,
        status: "draft",
        excerpt: `Content ${i}`,
      })),
    }];
    const ctx = buildChatContext({ projects });
    expect(ctx).toContain("12 au total");
    // The 7+ should not appear individually
    expect(ctx).toContain("7 PV plus anciens non détaillés");
  });

  it("mentions cahier des charges presence on every project", () => {
    const projects = [
      {
        id: 1, name: "Hall 6",
        cahierDesCharges: { fileName: "SNCB-clauses.pdf", uploadedAt: "2026-01-15T00:00:00Z", extractedText: "Article 1 : généralités…" },
      },
      { id: 2, name: "Sans CdC" },
    ];
    const ctx = buildChatContext({ projects });
    expect(ctx).toContain("SNCB-clauses.pdf");
    expect(ctx).toContain("Cahier des charges");
    // Le texte intégral n'est PAS inclus quand le projet n'est pas actif
    expect(ctx).not.toContain("Article 1");
    // Le projet sans CdC n'a pas la section
    const blocks = ctx.split("---");
    const sansCdcBlock = blocks.find(b => b.includes("Sans CdC"));
    expect(sansCdcBlock).toBeDefined();
    expect(sansCdcBlock).not.toContain("Cahier des charges");
  });

  it("includes full CdC text only for the active project", () => {
    const projects = [
      {
        id: 1, name: "Active",
        cahierDesCharges: { fileName: "active-cdc.pdf", extractedText: "TEXTE_DU_CDC_ACTIF" },
      },
      {
        id: 2, name: "Other",
        cahierDesCharges: { fileName: "other-cdc.pdf", extractedText: "TEXTE_DU_CDC_AUTRE" },
      },
    ];
    const ctx = buildChatContext({ projects, activeProjectId: 1 });
    expect(ctx).toContain("# Projet en cours de consultation");
    expect(ctx).toContain("TEXTE_DU_CDC_ACTIF");
    expect(ctx).not.toContain("TEXTE_DU_CDC_AUTRE");
    // Mais l'autre projet doit quand même mentionner que le CdC existe
    expect(ctx).toContain("other-cdc.pdf");
  });

  it("includes full last PV content for active project", () => {
    const projects = [{
      id: 1, name: "Active",
      pvHistory: [
        { number: 2, date: "10/02/2026", status: "draft", excerpt: "résumé", content: "01. Section\n01.1 Remarque détaillée FULL_CONTENT" },
        { number: 1, date: "01/01/2026", status: "sent", excerpt: "ancien" },
      ],
    }];
    const ctx = buildChatContext({ projects, activeProjectId: 1 });
    expect(ctx).toContain("FULL_CONTENT");
    // Le PV antérieur reste en excerpt
    expect(ctx).toContain("ancien");
  });

  it("lists reserves with severity for active project only", () => {
    const projects = [{
      id: 1, name: "Active",
      reserves: [
        { id: 1, text: "Fissure mur nord", severity: "major", status: "non_levee" },
        { id: 2, text: "Joint silicone", severity: "minor", status: "levee" },
      ],
    }];
    const ctxDetailed = buildChatContext({ projects, activeProjectId: 1 });
    expect(ctxDetailed).toContain("Fissure mur nord");
    expect(ctxDetailed).toContain("[major/non_levee]");
    // Sans activeProjectId, juste les compteurs
    const ctxSummary = buildChatContext({ projects });
    expect(ctxSummary).toContain("2 au total, 1 non levées");
    expect(ctxSummary).not.toContain("Fissure mur nord");
  });
});
