import { describe, it, expect } from "vitest";
import { hasFeature, getLimit, PLANS } from "../../constants/config";

describe("hasFeature", () => {
  it("free plan has limited features", () => {
    expect(hasFeature("free", "sendEmail")).toBe(false);
    expect(hasFeature("free", "gallery")).toBe(false);
    expect(hasFeature("free", "planning")).toBe(false);
    expect(hasFeature("free", "pdfNoWatermark")).toBe(false);
  });

  it("pro plan has most features", () => {
    expect(hasFeature("pro", "sendEmail")).toBe(true);
    expect(hasFeature("pro", "gallery")).toBe(true);
    expect(hasFeature("pro", "planning")).toBe(true);
    expect(hasFeature("pro", "pdfNoWatermark")).toBe(true);
    // pdfCustomLogo : feature Pro (l'archi solo en a besoin aussi).
    expect(hasFeature("pro", "pdfCustomLogo")).toBe(true);
  });

  it("unknown feature keys default to granted (no gate)", () => {
    // POC : les gates Team-only (roles/exportCsv/planningCross) ont été retirés ;
    // une clé absente n'est plus un gate → hasFeature renvoie true.
    expect(hasFeature("pro", "roles")).toBe(true);
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
});

describe("PLANS", () => {
  it("has two plans defined (POC solo : Free + Pro)", () => {
    expect(Object.keys(PLANS)).toEqual(["free", "pro"]);
  });

  it("free plan is free", () => {
    expect(PLANS.free.price).toBe(0);
  });

  it("pro plan costs 39/month (390/year)", () => {
    expect(PLANS.pro.price).toBe(39);
    expect(PLANS.pro.priceYear).toBe(390);
  });
});
