import { describe, expect, it } from "vitest";
import { buildApp } from "../../../app.js";
import { createMemoryDataStore } from "../../../platform/data-store.js";
import { createReadinessChecker } from "../service.js";

describe("health readiness", () => {
  it("reuses dependency readiness checks within the cache window", async () => {
    const app = await buildApp({ dataStore: createMemoryDataStore(), rateLimit: false });
    try {
      await app.ready();
      const checkReadiness = createReadinessChecker(app, 60_000);

      const first = await checkReadiness();
      const second = await checkReadiness();

      expect(first).toBe(second);
      expect(first.checks.database.status).toBe("not_applicable");
      expect(first.checks.valkey.status).toBe("not_applicable");
    } finally {
      await app.close();
    }
  });
});
