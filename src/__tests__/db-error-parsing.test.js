import { describe, it, expect } from "vitest";
import { parseFunctionError } from "../db";

describe("parseFunctionError", () => {
  it("returns the parsed JSON body when the SDK error wraps a JSON response", async () => {
    const error = {
      message: "Edge Function returned a non-2xx status code",
      context: {
        json: async () => ({ error: "Cette personne est déjà membre", code: "already_member" }),
      },
    };
    const result = await parseFunctionError(error);
    expect(result.error).toBe("Cette personne est déjà membre");
    expect(result.code).toBe("already_member");
  });

  it("returns the structured payload for the owner-of-orgs delete-account refusal", async () => {
    const error = {
      message: "Edge Function returned a non-2xx status code",
      context: {
        json: async () => ({
          error: "Vous êtes propriétaire d'agences.",
          code: "owner_of_orgs",
          orgs: [
            { id: "abc-1", name: "DEWIL architecten", status: "active" },
            { id: "abc-2", name: "Atelier Moreau", status: "active" },
          ],
        }),
      },
    };
    const result = await parseFunctionError(error);
    expect(result.code).toBe("owner_of_orgs");
    expect(result.orgs).toHaveLength(2);
    expect(result.orgs[0].name).toBe("DEWIL architecten");
  });

  it("falls back to the SDK error message when context cannot be parsed", async () => {
    const error = {
      message: "Network error",
      context: {
        json: async () => { throw new Error("not json"); },
      },
    };
    const result = await parseFunctionError(error);
    expect(result.error).toBe("Network error");
  });

  it("falls back to the SDK error message when context is missing", async () => {
    const error = { message: "Failed to send a request to the Edge Function" };
    const result = await parseFunctionError(error);
    expect(result.error).toBe("Failed to send a request to the Edge Function");
  });

  it("returns 'Erreur inconnue' if the error has no usable shape", async () => {
    const result = await parseFunctionError(null);
    expect(result.error).toBe("Erreur inconnue");
  });
});
