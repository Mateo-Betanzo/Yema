// Spec 012 · T2: the Edge Function daily-summary (RF-6, RF-10, RF-20, RF-23). Deno, outside the app's tsc
// and lint (npm: imports); its logic lives in prompt.ts, which Jest tests. It answers only the admin:
// the platform checks the JWT (verify_jwt, on by default: 401 without a session) and the function checks
// is_admin() with the caller's own permissions (403 otherwise). It validates the facts of the day (400),
// needs the ANTHROPIC_API_KEY secret (503 when it is not set) and asks Claude for the text (502 when the
// API fails or declines). The key never reaches the app (constitution, principle 2).
import Anthropic from "npm:@anthropic-ai/sdk@1.10.0";
import { withSupabase } from "npm:@supabase/server@1.9.2";

import { isDailyFacts, summaryPrompt } from "./prompt.ts";

// The default model of the Claude API reference (claude-api skill, 2026-11-19), at low effort: a short
// text. Claude Opus 5.5 always reasons, and that counts in max_tokens, so it gets room.
const MODEL = "claude-opus-5-5";
const MAX_TOKENS = 4096;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    // RF-23: the caller's own permissions decide; a client gets false.
    const { data: isAdmin, error: adminError } = await ctx.supabase.rpc("is_admin");
    if (adminError) return json({ error: "auth_check_failed" }, 500);
    if (isAdmin !== true) return json({ error: "forbidden" }, 403);

    // RF-10: only the facts of the day, nothing else.
    let facts: unknown;
    try {
      facts = await req.json();
    } catch {
      return json({ error: "invalid_body" }, 400);
    }
    if (!isDailyFacts(facts)) return json({ error: "invalid_facts" }, 400);

    // RF-20: the service without its key.
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "not_configured" }, 503);

    const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
    const { system, user } = summaryPrompt(facts);
    try {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: "low" },
        // A decline is retried on a fallback model inside the same call (default of the reference for
        // this model); a refusal of the whole chain still comes back as stop_reason "refusal".
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content: user }],
      });
      if (response.stop_reason === "refusal") return json({ error: "refused" }, 502);
      const summary = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join(" ")
        .trim();
      if (!summary) return json({ error: "empty" }, 502);
      return json({ summary });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) return json({ error: "rate_limited" }, 503);
      if (error instanceof Anthropic.APIConnectionError) return json({ error: "ai_unreachable" }, 502);
      if (error instanceof Anthropic.APIError) {
        console.error(`daily-summary: Claude API error ${error.status}`);
        return json({ error: "ai_error" }, 502);
      }
      throw error;
    }
  }),
};
