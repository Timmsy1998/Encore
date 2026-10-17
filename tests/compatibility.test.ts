import { describe, it, expect } from "vitest";
import {
  requiredFeatures,
  importDiagnostics,
  requestVolume,
  chatTarget,
} from "../desktop/compatibility";
describe("upstream import contracts", () => {
  it("diagnoses missing capabilities and versions", () => {
    expect(
      importDiagnostics({ version: "1.1.0", features: requiredFeatures }),
    ).toContain("all required");
    expect(importDiagnostics({ version: "1.0", features: [] })).toContain(
      "missing: version 1.1.0",
    );
    expect(importDiagnostics({ features: [] })).toContain("VOTE_SKIP");
  });
  it("supports imported relative volume and get without a value", () => {
    expect(requestVolume(70, { mode: "add", value: 50 })).toBe(100);
    expect(requestVolume(70, { mode: "sub", value: 10 })).toBe(60);
    expect(requestVolume(70, { mode: "get" })).toBe(70);
    expect(() => requestVolume(70, { mode: "set", value: "oops" })).toThrow();
  });
  it("routes replies to the originating platform", () => {
    expect(chatTarget({ platform: "YouTube", broadcastId: "abc" })).toEqual({
      chatSource: "youtube",
      youtubeBroadcastId: "abc",
    });
    expect(chatTarget({ source: "unknown" })).toEqual({ chatSource: "all" });
  });
});
