import { generateText, streamText, type CoreMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider";
import { createChildLogger } from "../logger/index.js";
import { UsageTracker } from "./usage.js";
import type { LlmProvider, LlmConfig } from "../config/schema.js";

const log = createChildLogger("llm:router");

/**
 * Create a Vercel AI SDK model instance from a provider config.
 */
function createModel(provider: LlmProvider) {
  switch (provider.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: provider.apiKey })(provider.model);
    case "openai":
      return createOpenAI({
        apiKey: provider.apiKey,
        ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
      })(provider.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: provider.apiKey })(
        provider.model
      );
    case "ollama":
      return createOllama({
        baseURL: provider.baseUrl ?? "http://localhost:11434/api",
      })(provider.model);
    default:
      throw new Error(`Unknown LLM provider: ${provider.provider}`);
  }
}

export class LlmRouter {
  private usage = new UsageTracker();

  constructor(private config: LlmConfig) {
    log.info(
      {
        primary: config.primary.provider,
        model: config.primary.model,
        fallbacks: config.fallbacks.length,
      },
      "LLM router initialized"
    );
  }

  /**
   * Generate a full response (non-streaming).
   * Tries primary, then fallbacks in order.
   */
  async generate(
    messages: CoreMessage[],
    sessionId: string,
    systemPrompt?: string
  ): Promise<{ text: string; provider: string; model: string }> {
    const providers = [this.config.primary, ...this.config.fallbacks];

    for (const provider of providers) {
      try {
        const model = createModel(provider);
        const result = await generateText({
          model,
          messages,
          ...(systemPrompt ? { system: systemPrompt } : {}),
        });

        this.usage.record(
          provider.provider,
          provider.model,
          (result.usage as any)?.inputTokens ?? 0,
          (result.usage as any)?.outputTokens ?? 0,
          sessionId
        );

        log.info(
          {
            provider: provider.provider,
            model: provider.model,
            tokensIn: (result.usage as any)?.inputTokens ?? 0,
            tokensOut: (result.usage as any)?.outputTokens ?? 0,
          },
          "LLM response generated"
        );

        return {
          text: result.text,
          provider: provider.provider,
          model: provider.model,
        };
      } catch (err) {
        log.warn(
          { provider: provider.provider, model: provider.model, err },
          "LLM provider failed, trying fallback"
        );
      }
    }

    throw new Error("All LLM providers failed");
  }

  /**
   * Stream a response. Yields text chunks.
   * Only tries primary provider (streaming + fallback is complex).
   */
  async *stream(
    messages: CoreMessage[],
    sessionId: string,
    systemPrompt?: string
  ): AsyncGenerator<string, void, unknown> {
    const provider = this.config.primary;
    const model = createModel(provider);

    const result = streamText({
      model,
      messages,
      ...(systemPrompt ? { system: systemPrompt } : {}),
    });

    let totalIn = 0;
    let totalOut = 0;

    for await (const chunk of result.textStream) {
      yield chunk;
      totalOut += chunk.length; // Approximate — real count from usage
    }

    // Record usage from final result
    const finalResult = await result;
    this.usage.record(
      provider.provider,
      provider.model,
      (finalResult.usage as any)?.inputTokens ?? totalIn,
      (finalResult.usage as any)?.outputTokens ?? totalOut,
      sessionId
    );
  }

  getUsage(): UsageTracker {
    return this.usage;
  }
}
