import OpenAI from "openai";

/**
 * Thin wrapper around an LLM call, routed through OpenRouter (an
 * OpenAI-compatible gateway) rather than calling any one provider directly.
 * Mirrors the isEmailPushConfigured() pattern in lib/notify.ts: a feature
 * stays fully wired but inert until OPENROUTER_API_KEY is set, so "real AI"
 * is a config change, not a code change.
 *
 * Model is picked via OPENROUTER_MODEL (any OpenRouter model slug, e.g.
 * "z-ai/glm-4.6", "moonshotai/kimi-k2-0905",
 * "anthropic/claude-3.5-haiku") — swap providers without touching code.
 */

const DEFAULT_MODEL = "deepseek/deepseek-v3.2";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://portside-portfolio.vercel.app",
        "X-Title": "Portside",
      },
    });
  }
  return client;
}

/** Whether the AI features are wired up (EM-only status display, like email push). */
export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export type AiContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; media_type: string; base64: string };

function toApiContent(
  blocks: AiContentBlock[],
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  return blocks.map((b) =>
    b.type === "text"
      ? { type: "text", text: b.text }
      : { type: "image_url", image_url: { url: `data:${b.media_type};base64,${b.base64}` } },
  );
}

/**
 * A single, non-streaming LLM call. Every caller here is a straightforward
 * extraction/summarization/drafting task — no multi-step reasoning needed —
 * which keeps latency and cost predictable on a publicly reachable demo.
 */
export async function generateText(params: {
  system: string;
  content: AiContentBlock[];
  maxTokens?: number;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}): Promise<string> {
  if (!isAiConfigured()) {
    throw new Error(
      "AI features are not configured in this environment (missing OPENROUTER_API_KEY).",
    );
  }

  const response = await getClient().chat.completions.create({
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? 1024,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: toApiContent(params.content) },
    ],
    ...(params.jsonSchema
      ? {
          response_format: {
            type: "json_schema" as const,
            json_schema: {
              name: params.jsonSchema.name,
              strict: true,
              schema: params.jsonSchema.schema,
            },
          },
        }
      : {}),
  });

  const choice = response.choices[0];
  if (!choice) {
    throw new Error("The model returned no response.");
  }
  if (choice.finish_reason === "content_filter") {
    throw new Error("The model declined to answer that request.");
  }
  const text = choice.message?.content;
  if (!text) {
    throw new Error("The model returned no text output.");
  }
  return text;
}
