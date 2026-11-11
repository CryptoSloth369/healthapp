import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { apiTools, PROPOSAL_TOOLS, runTool } from "./tools";
import { apiErrorReason } from "@/lib/api-error";

const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 10;

function systemPrompt(today: string, timezone: string) {
  return `You are the coach inside a personal health-tracking app used by one person. They log food (calories and macros), weight, workouts (weightlifting sets, swimming, walking/running miles, jiu-jitsu), mood with sleep, and a journal of their thoughts (often dictated). Units are pounds and US customary.

Today is ${today} (${timezone}).

How to work:
- Look at the real data with your tools before answering. Pick date ranges that fit the question (often the last 2–4 weeks; longer for trends).
- Base conclusions on the numbers and say which numbers and dates you used, so the person can check them. Note gaps (days without food logs, missing weigh-ins) and how they limit the conclusion.
- Daily weight swings are mostly water; reason from the trend weight and weekly rate, not single weigh-ins.
- Exercise calories are added to the daily budget. Logged calories burned are often estimates; treat them as approximate.
- Be direct and practical. Lead with the answer, then the evidence, then 1–3 concrete next steps. Use short paragraphs, bullet points and small tables where they help. Keep most replies under about 300 words unless asked for a full plan.
- For plans (training programs, meal ideas, calorie changes), base them on what the person actually does and lifts, with specific numbers. Progress loads gradually.
- To suggest changing the calorie target or to offer a workout template, call the propose_* tools; the app shows the person a card to approve. Never say a change was made; they decide.
- The journal is private writing. Read it (get_journal) when it helps explain mood, stress, sleep, eating or training, or when asked about it. Refer to what they wrote briefly and kindly; don't quote long passages back or comment on writing style. Dictated text may have transcription errors.
- You are not a doctor. Don't diagnose. For very low intake, rapid weight change, signs of disordered eating, injury, or persistent low mood, say so kindly and suggest talking to a professional. Never suggest eating below 1,200 kcal (women) or 1,500 kcal (men) per day.`;
}

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "proposal"; id: string; name: string; input: unknown }
  | { type: "conversation"; id: number }
  | { type: "error"; message: string }
  | { type: "done" };

type StoredMessage = { role: "user" | "assistant"; content: Anthropic.Beta.BetaMessageParam["content"] };

const TOOL_LABELS: Record<string, string> = {
  get_profile_and_goals: "your profile and goals",
  get_daily_summary: "your daily totals",
  get_food_log: "your food log",
  get_workouts: "your workouts",
  get_lift_progress: "your lift progress",
  get_mood_log: "your mood check-ins",
  get_journal: "your journal",
  get_energy_balance: "your energy balance",
  get_workout_templates: "your templates",
};

/**
 * After a mid-answer fallback to another model, blocks the first model produced
 * before the last `fallback` marker must not be sent back (except text and the
 * marker itself). Applying this before storing keeps replays valid.
 */
export function sanitizeAfterFallback(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlock[] {
  const last = content.map((b) => b.type as string).lastIndexOf("fallback");
  if (last <= 0) return content;
  const drop = new Set(["thinking", "redacted_thinking", "tool_use", "server_tool_use"]);
  return content.filter((b, i) => i >= last || !drop.has(b.type as string));
}

export async function* runAgent(opts: {
  conversationId: number | null;
  userText: string;
  today: string;
  timezone: string;
}): AsyncGenerator<AgentEvent> {
  if (!process.env.ANTHROPIC_API_KEY) {
    yield { type: "error", message: "The coach needs ANTHROPIC_API_KEY in Vercel (the same key as the photo estimator)." };
    return;
  }
  const supabase = await createClient();

  // Load or create the conversation.
  let conversationId = opts.conversationId;
  const history: StoredMessage[] = [];
  if (conversationId) {
    const { data, error } = await supabase
      .from("assistant_message")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("seq")
      .overrideTypes<StoredMessage[], { merge: false }>();
    if (error) {
      yield { type: "error", message: "Couldn't load this conversation." };
      return;
    }
    history.push(...(data ?? []));
  } else {
    const { data, error } = await supabase
      .from("assistant_conversation")
      .insert({ title: opts.userText.slice(0, 60) })
      .select("id")
      .single<{ id: number }>();
    if (error) {
      yield { type: "error", message: `Couldn't start a conversation: ${error.message}` };
      return;
    }
    conversationId = data.id;
  }
  yield { type: "conversation", id: conversationId };

  let seq = history.length;
  async function persist(m: StoredMessage) {
    history.push(m);
    await supabase.from("assistant_message").insert({ conversation_id: conversationId, seq: seq++, role: m.role, content: m.content });
  }
  await persist({ role: "user", content: opts.userText });
  await supabase.from("assistant_conversation").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  const client = new Anthropic();
  const tools = apiTools();
  const system = systemPrompt(opts.today, opts.timezone);

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let message: Anthropic.Beta.BetaMessage;
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        system,
        tools,
        messages: history as Anthropic.Beta.BetaMessageParam[],
        // Progress updates between tool calls arrive as short thinking blocks.
        thinking: { type: "adaptive", display: "updates" },
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        // If a safety classifier declines, Anthropic retries on its recommended model.
        fallbacks: "default",
        betas: ["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"],
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") yield { type: "text", delta: event.delta.text };
          else if (event.delta.type === "thinking_delta" && event.delta.thinking.trim())
            yield { type: "status", text: event.delta.thinking.trim() };
        } else if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          const label = TOOL_LABELS[event.content_block.name];
          if (label) yield { type: "status", text: `Looking at ${label}…` };
        }
      }
      message = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        // Shows up in Vercel → Functions logs; the request id helps Anthropic support.
        console.error("coach API error", err.status, err.requestID, JSON.stringify(err.error));
      }
      if (err instanceof Anthropic.RateLimitError) yield { type: "error", message: "Too many requests right now. Try again in a minute." };
      else if (err instanceof Anthropic.AuthenticationError) yield { type: "error", message: "The Anthropic API key was rejected." };
      else if (err instanceof Anthropic.APIError) {
        const reason = apiErrorReason(err.error);
        yield { type: "error", message: `The coach is unavailable (error ${err.status})${reason ? `: ${reason}` : "."}` };
      }
      else yield { type: "error", message: "Something went wrong. Try again." };
      return;
    }

    const content = sanitizeAfterFallback(message.content);
    if (message.stop_reason === "refusal") {
      yield { type: "error", message: "The coach declined to answer that. Try rephrasing." };
      return;
    }
    await persist({ role: "assistant", content: content as Anthropic.Beta.BetaContentBlockParam[] });

    const toolUses = content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break;
    if (message.stop_reason !== "tool_use") {
      // Cut off mid tool call (e.g. max_tokens): answer each call with an error so
      // the stored conversation stays valid, and don't run truncated input.
      await persist({
        role: "user",
        content: toolUses.map((t) => ({ type: "tool_result" as const, tool_use_id: t.id, content: "Not run: the response was cut off.", is_error: true })),
      });
      yield { type: "error", message: "The answer was cut off. Ask again, or narrow the question." };
      return;
    }
    if (round === MAX_TOOL_ROUNDS) {
      yield { type: "error", message: "The coach used too many steps on this one. Try a narrower question." };
      return;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const r = await runTool(t.name, t.input, { today: opts.today });
      if (r.ok && PROPOSAL_TOOLS.has(t.name)) yield { type: "proposal", id: t.id, name: t.name, input: t.input };
      results.push({ type: "tool_result", tool_use_id: t.id, content: r.content, ...(r.ok ? {} : { is_error: true }) });
    }
    await persist({ role: "user", content: results });
  }
  yield { type: "done" };
}
