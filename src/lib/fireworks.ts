import { OpenAI } from "openai";

// Uses the Fireworks AI API (OpenAI compatible)
export const fireworks = new OpenAI({
    apiKey: process.env.FIREWORKS_API_KEY,
    baseURL: "https://api.fireworks.ai/inference/v1",
});

// The model we will eventually use (placeholder for now until fine-tuning is done)
// We will use the base model as fallback until the fine-tuned one is ready.
export const SQL_MODEL_ID = process.env.FIREWORKS_MODEL_ID || "accounts/fireworks/models/qwen2p5-coder-7b-instruct";
