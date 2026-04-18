import { describe, it, expect } from "vitest";
import { hasFeature, getLimit, PLANS, PLAN_FEATURES } from "../../constants/config";

describe("hasFeature", () => {
  it("free plan has limited features", () => {
    expect(hasFeature("free", "sendEmail")).toBe(false);
    expect(hasFeature("free", "gallery")).toBe(false);
    expect(hasFeature("free", "planning")).toBe(false);
    expect(hasFeature("free", "roles")).toBe(false);
    expect(hasFeature("free", "exportCsv")).toBe(false);
  });

  it("pro plan has most features", () => {
    expect(hasFeature("pro", "sendEmail")).toBe(true);
    expect(hasFeature("pro", "gallery")).toBe(true);
    expect(hasFeature("pro", "planning")).toBe(true);
    expect(hasFeature("pro", "pdfNoWatermark")).toBe(true);
  });

  it("pro plan does not have team-only features", () => {
    expect(hasFeature("pro", "roles")).toBe(false);
    expect(hasFeature("pro", "exportCsv")).toBe(false);
    expect(hasFeature("pro", "pdfCustomLogo")).toBe(false);
  });

  it("team plan has all features", () => {
    expect(hasFeature("team", "sendEmail")).toBe(true);
    expect(hasFeature("team", "roles")).toBe(true);
    expect(hasFeature("team", "exportCsv")).toBe(true);
    expect(hasFeature("team", "pdfCustomLogo")).toBe(true);
  });
});

describe("getLimit", () => {
  it("free plan has strict limits", () => {
    expect(getLimit("free", "maxProjects")).toBe(1);
    expect(getLimit("free", "maxPvPerMonth")).toBe(3);
    expect(getLimit("free", "maxAiPerMonth")).toBe(3);
    expect(getLimit("free", "maxCollabPerProj")).toBe(0);
  });

  it("pro plan has unlimited projects and PV", () => {
    expect(getLimit("pro", "maxProjects")).toBe(Infinity);
    expect(getLimit("pro", "maxPvPerMonth")).toBe(Infinity);
    expect(getLimit("pro", "maxAiPerMonth")).toBe(Infinity);
  });

  it("pro plan has limited collaborators", () => {
    expect(getLimit("pro", "maxCollabPerProj")).toBe(3);
  });

  it("team plan has unlimited everything", () => {
    expect(getLimit("team", "maxProjects")).toBe(Infinity);
    expect(getLimit("team", "maxCollabPerProj")).toBe(Infinity);
  });
});

describe("PLANS", () => {
  it("has three plans defined", () => {
    expect(Object.keys(PLANS)).toEqual(["free", "pro", "team"]);
  });

  it("free plan is free", () => {
    expect(PLANS.free.price).toBe(0);
  });

  it("pro plan costs 29/month", () => {
    expect(PLANS.pro.price).toBe(29);
  });

  it("team plan costs 59/month", () => {
    expect(PLANS.team.price).toBe(59);
  });
});
