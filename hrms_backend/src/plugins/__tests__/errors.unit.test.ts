import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { ErrorCodes } from "#shared";
import { AppError } from "../../platform/errors.js";
import { errorsPlugin } from "../errors.js";

describe("errorsPlugin AppError headers", () => {
  it("emits only approved AppError response headers", async () => {
    const app = Fastify();
    await app.register(errorsPlugin);
    app.get("/error", async () => {
      throw new AppError(
        ErrorCodes.WorkflowConflict,
        "Replay",
        409,
        undefined,
        {
          "Idempotency-Replayed": "true",
          "X-Unsafe-Debug": "leak",
        },
      );
    });

    const response = await app.inject({ method: "GET", url: "/error" });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.headers["idempotency-replayed"]).toBe("true");
    expect(response.headers["x-unsafe-debug"]).toBeUndefined();
  });
});
