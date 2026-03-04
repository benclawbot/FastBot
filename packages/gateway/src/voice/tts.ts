/**
 * Text-to-Speech module using multiple providers
 */
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("tts");

export interface TtsOptions {
  provider: "elevenlabs" | "openai" | "google" | "polly";
  voice?: string;
  model?: string;
}

export interface TtsResult {
  audio: Buffer;
  format: string;
}

/**
 * Convert text to speech using the configured provider
 */
export async function textToSpeech(
  text: string,
  apiKey: string,
  options: TtsOptions
): Promise<TtsResult> {
  switch (options.provider) {
    case "elevenlabs":
      return textToSpeechElevenLabs(text, apiKey, options.voice);
    case "openai":
      return textToSpeechOpenAI(text, apiKey, options.model);
    case "google":
      return textToSpeechGoogle(text, apiKey);
    case "polly":
      return textToSpeechPolly(text, apiKey);
    default:
      throw new Error(`Unknown TTS provider: ${options.provider}`);
  }
}

/**
 * ElevenLabs TTS
 */
async function textToSpeechElevenLabs(
  text: string,
  apiKey: string,
  voiceId: string = "rachel"
): Promise<TtsResult> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${error}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  return { audio, format: "mp3" };
}

/**
 * OpenAI TTS
 */
async function textToSpeechOpenAI(
  text: string,
  apiKey: string,
  model: string = "tts-1"
): Promise<TtsResult> {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice: "alloy",
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI TTS failed: ${error}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  return { audio, format: "mp3" };
}

/**
 * Google Cloud TTS (using basic auth)
 */
async function textToSpeechGoogle(text: string, _apiKey: string): Promise<TtsResult> {
  // Google Cloud TTS requires service account - simplified for now
  log.warn("Google TTS not fully implemented - requires service account");
  throw new Error("Google TTS requires service account setup");
}

/**
 * AWS Polly TTS
 */
async function textToSpeechPolly(text: string, _apiKey: string): Promise<TtsResult> {
  // AWS Polly requires AWS SDK - simplified for now
  log.warn("AWS Polly TTS not fully implemented");
  throw new Error("AWS Polly TTS requires AWS credentials");
}

/**
 * Get available voices for a provider
 */
export async function getVoices(provider: string, apiKey: string): Promise<string[]> {
  switch (provider) {
    case "elevenlabs": {
      const response = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKey },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch ElevenLabs voices");
      }
      const data = await response.json() as { voices: Array<{ voice_id: string; name: string }> };
      return data.voices.map((v) => v.name || v.voice_id);
    }
    case "openai":
      // OpenAI uses fixed voices
      return ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    default:
      return [];
  }
}
