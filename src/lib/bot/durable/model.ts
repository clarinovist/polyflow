import {
    createModels,
    createProvider,
    envApiKeyAuth,
    type Model,
    type MutableModels,
} from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';

export const POLYFLOW_MODEL_PROVIDER = 'polyflow-openai-compatible';

export type DurableModelConfig = {
    baseUrl: string;
    modelId: string;
    contextWindow: number;
    maxTokens: number;
};

export function createDurableModels(config: DurableModelConfig): {
    models: MutableModels;
    model: Model<string>;
} {
    const model: Model<'openai-completions'> = {
        id: config.modelId,
        name: config.modelId,
        provider: POLYFLOW_MODEL_PROVIDER,
        api: 'openai-completions',
        baseUrl: config.baseUrl,
        input: ['text'],
        reasoning: false,
        contextWindow: config.contextWindow,
        maxTokens: config.maxTokens,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        compat: {
            supportsStore: false,
            supportsDeveloperRole: false,
            supportsReasoningEffort: false,
            supportsUsageInStreaming: true,
            maxTokensField: 'max_tokens',
        },
    };
    const provider = createProvider({
        id: POLYFLOW_MODEL_PROVIDER,
        name: 'Polyflow OpenAI-compatible gateway',
        baseUrl: config.baseUrl,
        auth: { apiKey: envApiKeyAuth('Polyflow LLM key', ['LLM_API_KEY']) },
        models: [model],
        api: { 'openai-completions': openAICompletionsApi() },
    });
    const models = createModels();
    models.setProvider(provider);
    return { models, model };
}
