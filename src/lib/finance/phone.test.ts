import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["(61) 99999-9999", "+5561999999999"],
    ["61999999999", "+5561999999999"],
    ["+55 61 99999-9999", "+5561999999999"],
    ["5561999999999", "+5561999999999"],
    ["0055 61 99999 9999", "+5561999999999"],
    ["(11) 3333-4444", "+551133334444"],
    ["+1 415 555 2671", "+14155552671"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "abc", "12345", "(61) 09999-9999", "(01) 99999-9999", "+55 61 1999-9999", "+0123456789"])(
    "rejeita %j",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe("formatPhone", () => {
  it("formata números brasileiros", () => {
    expect(formatPhone("+5561999999999")).toBe("+55 (61) 99999-9999");
    expect(formatPhone("+551133334444")).toBe("+55 (11) 3333-4444");
    expect(formatPhone("+14155552671")).toBe("+14155552671");
  });
});
