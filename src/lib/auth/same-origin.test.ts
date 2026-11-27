import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./same-origin";

const url = "https://financas.exemplo.com/auth/signout";
const h = (init: Record<string, string>) => new Headers(init);

describe("isSameOriginRequest", () => {
  it("aceita o próprio site", () => {
    expect(isSameOriginRequest(h({ origin: "https://financas.exemplo.com" }), url)).toBe(true);
    expect(isSameOriginRequest(h({ "sec-fetch-site": "same-origin" }), url)).toBe(true);
  });

  it("recusa outro site, subdomínio parecido ou sem pista nenhuma", () => {
    expect(isSameOriginRequest(h({ origin: "https://site-malicioso.exemplo" }), url)).toBe(false);
    expect(isSameOriginRequest(h({ origin: "https://financas.exemplo.com.malicioso.exemplo" }), url)).toBe(false);
    expect(isSameOriginRequest(h({ origin: "http://financas.exemplo.com" }), url)).toBe(false);
    expect(isSameOriginRequest(h({ "sec-fetch-site": "cross-site" }), url)).toBe(false);
    expect(isSameOriginRequest(h({}), url)).toBe(false);
  });
});
