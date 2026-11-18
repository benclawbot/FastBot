import { once } from "node:events";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appConfigSchema } from "../config/schema.js";
import { createHealthRouter } from "./health.js";

describe("health reset API", () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    const config = appConfigSchema.parse({
      llm: { primary: { provider: "ollama", model: "test-model" } },
    });
    app.use("/api/health", createHealthRouter(config));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP listener");
    }
    baseUrl = `http://127.0.0.1:${address.port}/api/health`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it.each([
    ["/reset", "all"],
    ["/reset/test-integration", "test-integration"],
  ])("accepts POST %s", async (path, reset) => {
    const response = await fetch(baseUrl + path, { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", reset });
  });
});
