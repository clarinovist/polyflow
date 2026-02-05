import { OpenAI } from "openai";

// Uses the Fireworks AI API (OpenAI compatible)
export const fireworks = new OpenAI({
    apiKey: process.env.FIREWORKS_API_KEY,
    baseURL: "https://api.fireworks.ai/inference/v1",
});

// The fine-tuned model for Polyflow Text-to-SQL
export const SQL_MODEL_ID = process.env.FIREWORKS_MODEL_ID || "accounts/nugrohop2003/deployedModels/polyflow-sql-v1-o02d7rif";
