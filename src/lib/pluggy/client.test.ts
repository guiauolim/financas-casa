import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { pluggyConfigFor, pluggyCronConfig } = await import("./client");

// Valores inventados.
const env = {
  PLUGGY_CLIENT_ID: "id-ficticio",
  PLUGGY_CLIENT_SECRET: "segredo-ficticio",
  PLUGGY_ITEM_IDS: "item-a, item-b",
  PLUGGY_HOUSEHOLD_ID: "casa-dona",
};

describe("pluggyConfigFor", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("só a casa de PLUGGY_HOUSEHOLD_ID recebe a configuração", () => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    expect(pluggyConfigFor("casa-dona")).toMatchObject({ householdId: "casa-dona", itemIds: ["item-a", "item-b"] });
    expect(pluggyConfigFor("outra-casa")).toBeNull();
    expect(pluggyCronConfig()?.householdId).toBe("casa-dona");
  });

  it("sem PLUGGY_HOUSEHOLD_ID, ninguém usa as credenciais", () => {
    for (const [k, v] of Object.entries({ ...env, PLUGGY_HOUSEHOLD_ID: "" })) vi.stubEnv(k, v);
    expect(pluggyConfigFor("casa-dona")).toBeNull();
    expect(pluggyCronConfig()).toBeNull();
  });
});
