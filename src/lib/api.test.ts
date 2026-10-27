import { describe, expect, it } from "vitest";
import { entryHash } from "./audit";
import { parseScopes } from "./api-tokens";
import { pkceChallenge, validRedirectUri } from "./oauth";
import { handleRpc } from "./mcp";
import { nextVatReturn } from "./ops";
import type { Actor } from "./audit";

describe("entryHash", () => {
  const e = { actorType: "token", actorName: "Claude", action: "voucher.create", entity: "voucher", entityId: 1, detail: "{}", createdAt: new Date("2026-10-27T08:00:00Z") };

  it("verkettet mit dem vorigen Hash", () => {
    expect(entryHash("a", e)).not.toBe(entryHash("b", e));
  });

  it("ändert sich bei jeder Änderung des Eintrags", () => {
    expect(entryHash("a", e)).not.toBe(entryHash("a", { ...e, detail: '{"x":1}' }));
    expect(entryHash("a", e)).toBe(entryHash("a", { ...e }));
  });
});

describe("parseScopes", () => {
  it("kennt nur gültige Rechte und entfernt Doppelte", () => {
    expect(parseScopes("read draft,draft admin")).toEqual(["read", "draft"]);
  });
});

describe("OAuth", () => {
  it("prüft PKCE nach RFC 7636", () => {
    // Beispiel aus RFC 7636, Anhang B
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("lässt nur https und lokale Weiterleitungen zu", () => {
    expect(validRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(validRedirectUri("http://localhost:6274/callback")).toBe(true);
    expect(validRedirectUri("http://example.com/callback")).toBe(false);
    expect(validRedirectUri("javascript:alert(1)")).toBe(false);
  });
});

describe("MCP", () => {
  const reader: Actor = { type: "token", name: "Leser", scopes: ["read"] };
  const drafter: Actor = { type: "token", name: "Claude", scopes: ["read", "draft"] };

  it("handelt die Protokollversion aus", async () => {
    const r = (await handleRpc(reader, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })) as { result: { protocolVersion: string } };
    expect(r.result.protocolVersion).toBe("2025-06-18");
    const r2 = (await handleRpc(reader, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })) as { result: { protocolVersion: string } };
    expect(r2.result.protocolVersion).toBe("2025-11-25");
  });

  it("zeigt nur Werkzeuge, für die der Schlüssel Rechte hat", async () => {
    const names = async (a: Actor) => ((await handleRpc(a, { jsonrpc: "2.0", id: 1, method: "tools/list" })) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    expect(await names(reader)).not.toContain("create_voucher_draft");
    expect(await names(drafter)).toContain("create_voucher_draft");
    expect(await names(drafter)).toContain("link_transaction");
  });

  it("beantwortet Benachrichtigungen nicht und meldet unbekannte Methoden", async () => {
    expect(await handleRpc(reader, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const r = (await handleRpc(reader, { jsonrpc: "2.0", id: 3, method: "resources/list" })) as { error: { code: number } };
    expect(r.error.code).toBe(-32601);
  });

  it("liefert fehlende Rechte als Werkzeugfehler", async () => {
    const r = (await handleRpc(reader, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "book_voucher", arguments: { id: 1 } } })) as { result: { isError: boolean; content: { text: string }[] } };
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toContain("draft");
  });
});

describe("nextVatReturn", () => {
  it("nennt den abgelaufenen Zeitraum bis zum 10. und danach den laufenden", () => {
    expect(nextVatReturn("QUARTER", new Date(2026, 9, 5))).toEqual({ period: { from: "2026-07-01", toExclusive: "2026-10-01" }, dueDate: "2026-10-10" });
    expect(nextVatReturn("QUARTER", new Date(2026, 9, 27))).toEqual({ period: { from: "2026-10-01", toExclusive: "2027-01-01" }, dueDate: "2027-01-10" });
    expect(nextVatReturn("MONTH", new Date(2026, 0, 8)).dueDate).toBe("2026-01-10");
  });
});
