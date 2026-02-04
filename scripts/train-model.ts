import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import OpenAI from "openai";

// Fireworks AI is OpenAI-compatible
const openai = new OpenAI({
    apiKey: process.env.FIREWORKS_API_KEY,
    baseURL: "https://api.fireworks.ai/inference/v1", // Try this first
});

const DATASET_PATH = path.join(process.cwd(), 'fine_tuning_dataset.jsonl');

async function main() {
    if (!process.env.FIREWORKS_API_KEY) {
        console.error("Error: FIREWORKS_API_KEY is not set.");
        process.exit(1);
    }

    if (!fs.existsSync(DATASET_PATH)) {
        console.error(`Error: Dataset file not found at ${DATASET_PATH}`);
        process.exit(1);
    }

    try {
        console.log("Step 1: Uploading dataset...");
        // Note: Some Fireworks implementations might require a different base URL for uploads
        // If this fails, we catch it.
        const file = await openai.files.create({
            file: fs.createReadStream(DATASET_PATH),
            purpose: "fine-tune",
        });

        console.log(`Dataset uploaded! File ID: ${file.id}`);

        console.log("Step 2: Creating Fine-Tuning Job...");
        const job = await openai.fineTuning.jobs.create({
            training_file: file.id,
            model: "accounts/fireworks/models/qwen2p5-coder-7b-instruct",
            hyperparameters: {
                batch_size: "auto",
                learning_rate_multiplier: "auto",
                n_epochs: "auto"
            },
            suffix: "polyflow-sql-v1"
        });

        console.log("Fine-tuning job started successfully!");
        console.log("Job ID:", job.id);
        console.log("Status:", job.status);
        console.log("\n---------------------------------------------------");
        console.log("Next Steps:");
        console.log("1. Wait for the job to complete (status: 'succeeded').");
        console.log("2. Copy the 'fine_tuned_model' ID from the Fireworks Dashboard.");
        console.log("3. Add it to your .env file: FIREWORKS_MODEL_ID=...");
        console.log("---------------------------------------------------");

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("\n❌ Automatic process failed.");
        console.error("Error details:", errorMessage);

        console.log("\n⚠️  MANUAL FALLBACK INSTRUCTIONS:");
        console.log("1. Go to: https://fireworks.ai/dashboard/datasets");
        console.log("2. Click 'Create Dataset' and upload 'fine_tuning_dataset.jsonl'.");
        console.log("3. Once uploaded, click 'Create Fine-Tuning Job'.");
        console.log("4. Select Base Model: 'Qwen 2.5-Coder-7B Instruct'.");
        console.log("5. Start the job and copy the resulting Model ID.");
    }
}

main();
