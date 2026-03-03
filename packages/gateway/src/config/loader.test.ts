import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadConfig, writeConfigScaffold } from "./loader.js";
import { writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TEST_CONFIG = resolve("data/test-config.json");

describe("config loader", () => {
  beforeEach(() => {
    mkdirSync("data", { recursive: true });
    // Clean env overrides
    delete process.env.SCB_TELEGRAM_TOKEN;
    delete process.env.SCB_LLM_PROVIDER;
    delete process.env.SCB_LLM_API_KEY;
    delete process.env.SCB_LLM_MODEL;
    delete process.env.SCB_PORT;
    delete process.env.SCB_PIN;
  });

  afterEach(() => {
    if (existsSync(TEST_CONFIG)) unlinkSync(TEST_CONFIG);
  });

  it("loads a valid config file", () => {
    writeFileSync(
      TEST_CONFIG,
      JSON.stringify({
        telegram: { botToken: "123:ABC" },
        llm: {
          primary: {
            provider: "anthropic",
            apiKey: "sk-test",
            model: "claude-sonnet-4-20250514",
          },
        },
      })
    );

    const config = loadConfig(TEST_CONFIG);
    expect(config.telegram.botToken).toBe("123:ABC");
    expect(config.llm.primary.provider).toBe("anthropic");
    // Port should be randomized (generated on load if not specified)
    expect(config.server.port).toBeGreaterThanOrEqual(30000);
    expect(config.server.port).toBeLessThanOrEqual(65535);
    expect(config.security.dashboardRateLimit).toBe(60); // default
  });

  it("applies env variable overrides", () => {
    writeFileSync(
      TEST_CONFIG,
      JSON.stringify({
        telegram: { botToken: "file-token" },
        llm: {
          primary: {
            provider: "anthropic",
            apiKey: "file-key",
            model: "claude-sonnet-4-20250514",
          },
        },
      })
    );

    process.env.SCB_TELEGRAM_TOKEN = "env-token";
    process.env.SCB_PORT = "9999";

    const config = loadConfig(TEST_CONFIG);
    expect(config.telegram.botToken).toBe("env-token"); // env wins
    expect(config.server.port).toBe(9999);
  });

  it("throws on invalid config", () => {
    writeFileSync(TEST_CONFIG, JSON.stringify({ bad: "data" }));
    expect(() => loadConfig(TEST_CONFIG)).toThrow("Invalid configuration");
  });

  it("throws when required fields are missing", () => {
    writeFileSync(
      TEST_CONFIG,
      JSON.stringify({ telegram: { botToken: "tok" } })
    );
    expect(() => loadConfig(TEST_CONFIG)).toThrow("llm");
  });

  it("uses defaults for optional fields", () => {
    writeFileSync(
      TEST_CONFIG,
      JSON.stringify({
        telegram: { botToken: "tok" },
        llm: {
          primary: { provider: "openai", apiKey: "k", model: "gpt-4" },
        },
      })
    );

    const config = loadConfig(TEST_CONFIG);
    // Port is randomized in the high range
    expect(config.server.port).toBeGreaterThanOrEqual(30000);
    expect(config.server.port).toBeLessThanOrEqual(65535);
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.telegram.rateLimit).toBe(20);
    expect(config.telegram.approvedUsers).toEqual([]);
    expect(config.memory.dbPath).toBe("data/scb.db");
    expect(config.llm.fallbacks).toEqual([]);
    expect(config.security.binaryAllowlist).toContain("git");
  });

  it("validates LLM provider enum", () => {
    writeFileSync(
      TEST_CONFIG,
      JSON.stringify({
        telegram: { botToken: "tok" },
        llm: {
          primary: { provider: "invalid-provider", model: "x" },
        },
      })
    );
    expect(() => loadConfig(TEST_CONFIG)).toThrow();
  });
});

describe("writeConfigScaffold", () => {
  const SCAFFOLD_PATH = resolve("data/test-scaffold.json");

  afterEach(() => {
    if (existsSync(SCAFFOLD_PATH)) unlinkSync(SCAFFOLD_PATH);
  });

  it("writes a scaffold file", () => {
    writeConfigScaffold(SCAFFOLD_PATH);
    expect(existsSync(SCAFFOLD_PATH)).toBe(true);

    const content = JSON.parse(
      require("node:fs").readFileSync(SCAFFOLD_PATH, "utf-8")
    );
    expect(content.telegram.botToken).toBe("YOUR_TELEGRAM_BOT_TOKEN");
    expect(content.llm.primary.provider).toBe("anthropic");
    expect(content.security.pin).toBe("");
  });
});
