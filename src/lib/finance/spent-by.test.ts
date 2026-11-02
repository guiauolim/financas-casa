import { describe, expect, it } from "vitest";
import { defaultSpentBy, HOUSE, spentByFromParam, spentByToParam } from "./spent-by";

const ANA = "00000000-0000-0000-0000-0000000000a1";

describe("defaultSpentBy", () => {
  it("categoria da casa vai para Casa, mesmo com pessoa", () => {
    expect(defaultSpentBy({ categoryHouseholdDefault: true, personUserId: ANA })).toBeNull();
  });

  it("outras categorias ficam com a pessoa do contexto", () => {
    expect(defaultSpentBy({ categoryHouseholdDefault: false, personUserId: ANA })).toBe(ANA);
    expect(defaultSpentBy({ categoryHouseholdDefault: undefined, personUserId: ANA })).toBe(ANA);
  });

  it("sem pessoa conhecida → Casa", () => {
    expect(defaultSpentBy({ categoryHouseholdDefault: false, personUserId: null })).toBeNull();
  });
});

describe("parâmetro de formulário", () => {
  it("Casa vira 'casa' e volta como null", () => {
    expect(spentByToParam(null)).toBe(HOUSE);
    expect(spentByFromParam(HOUSE)).toBeNull();
    expect(spentByFromParam(spentByToParam(ANA))).toBe(ANA);
  });
});
