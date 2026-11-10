import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { normalizeEstimate, PhotoEstimateSchema, type PhotoEstimate } from "./photo-estimate-schema";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You estimate the calories and macronutrients of meals from photos for a personal food log.

How to estimate:
- List each distinct food or drink separately. Include things that are easy to miss but add real calories: cooking oil or butter on cooked food, dressings, sauces, cheese, and the drink if one is visible.
- Judge portion size from visual cues: plate and bowl size (a standard dinner plate is about 10-11 inches), utensils, hands, packaging and labels. State the portion in everyday US units.
- Use typical nutrition values for the food as it appears to be prepared (fried vs grilled, dressed vs plain). If a package label or menu is readable, use it.
- Give your best single estimate rather than a range. Restaurant and takeout portions are usually larger and richer than home-cooked ones.
- Set confidence per item. Use "low" when the food is partly hidden, the portion is hard to judge, or the preparation is unclear.
- The person may add a hint (what it is, how much they ate, how it was cooked). Treat the hint as more reliable than the photo when they conflict.
- If the photo shows no food or drink, set is_food to false and return no items.`;

export class EstimateError extends Error {}

export async function estimateFromPhoto(input: {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  hint?: string;
}): Promise<PhotoEstimate> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new EstimateError("The photo estimator isn't set up yet: add ANTHROPIC_API_KEY in Vercel and redeploy.");
  }
  const client = new Anthropic();

  const hint = input.hint?.trim();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Set effort explicitly rather than relying on the model default. Medium is a good
      // balance of accuracy and wait time for a single photo.
      output_config: { effort: "medium", format: betaZodOutputFormat(PhotoEstimateSchema) },
      // If a safety classifier declines, retry on Anthropic's recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.imageBase64 } },
            {
              type: "text",
              text: hint ? `Estimate this meal. My note about it: ${hint}` : "Estimate this meal.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new EstimateError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel.");
    if (err instanceof Anthropic.RateLimitError) throw new EstimateError("Too many requests right now. Try again in a minute.");
    if (err instanceof Anthropic.BadRequestError) throw new EstimateError(`The photo couldn't be processed: ${err.message}`);
    if (err instanceof Anthropic.APIError) throw new EstimateError(`The estimator is unavailable (error ${err.status}). Try again shortly.`);
    throw err;
  }

  if (response.stop_reason === "refusal") throw new EstimateError("The estimator declined this photo. Enter the food manually instead.");
  if (response.stop_reason === "max_tokens") throw new EstimateError("The estimate was cut off. Try again.");
  if (!response.parsed_output) throw new EstimateError("The estimator returned something unexpected. Try again.");
  return normalizeEstimate(response.parsed_output);
}
