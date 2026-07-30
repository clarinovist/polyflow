import { enforceGuardrails } from './guardrails';
import { searchHelpArticles } from './help-articles';
import OpenAI from 'openai';
import {
    getToolsForContext,
    toolsToOpenAiFormat,
    getToolByName,
} from './tool-registry';
import { checkToolAuthorization } from './tool-authorization';
import { evidenceToText } from './evidence';
import { buildAssistantContext } from './assistant-context';
import { prisma } from '@/lib/core/prisma';
import {
    getOrCreateConversation,
    loadConversationContext,
    saveMessage,
    buildLlmHistory,
} from './conversation-service';
import { checkPromptInjection, logInjectionAttempt } from './injection-defense';
import {
    analyzeForClarification,
    resolvePronouns,
    calculateConfidence,
} from './clarifier';
import type {
    AssistantUserContext,
    AssistantResponse,
    CitedArticleForResponse,
    ToolEvidence,
} from './assistant-types';

const AGENTIC_DEBUG = process.env.AGENTIC_DEBUG === 'true';

// Re-export legacy types for backward compat
export type VirtualCsRequest = {
    question: string;
    channel: 'telegram' | 'web' | 'telegram_mini_app';
    requesterName?: string;
};

export type { CitedArticleForResponse };

export type VirtualCsResponse = AssistantResponse;

type SessionUser = {
    id?: string;
    name?: string | null;
    role?: string;
    roles?: string[];
    isSuperAdmin?: boolean;
    allowedResources?: string[] | 'ALL';
};

// ---------------------------------------------------------------------------
// Main entry point (permission-aware + conversation support)
// ---------------------------------------------------------------------------

export async function generateVirtualCsReply(
    input: VirtualCsRequest,
    context?: {
        tenantId?: string;
        sessionUser?: SessionUser;
        conversationId?: string;
    },
): Promise<VirtualCsResponse> {
    // 1. Guardrails
    const guard = enforceGuardrails(input.question);
    if (!guard.allowed) {
        return {
            answer: guard.reason || 'Maaf, permintaan tidak bisa diproses.',
            citations: ['policy:read-only', 'policy:topic-lock'],
            safety: {
                allowed: false,
                blockedReason: guard.reason,
            },
        };
    }

    // 1b. Prompt injection defense
    const injectionCheck = checkPromptInjection(input.question);
    if (!injectionCheck.safe) {
        if (context?.tenantId && context?.sessionUser?.id) {
            logInjectionAttempt({
                userId: context.sessionUser.id,
                tenantId: context.tenantId,
                message: input.question,
                pattern: injectionCheck.pattern || 'unknown',
                blocked: true,
            });
        }
        return {
            answer: 'Maaf, pesan Anda tidak dapat diproses karena mengandung elemen yang tidak diizinkan. Silakan sampaikan pertanyaan Anda dengan cara yang biasa.',
            citations: ['policy:security'],
            safety: {
                allowed: false,
                blockedReason: 'Prompt injection attempt blocked',
            },
        };
    }

    // 2. Build context (if tenantId and sessionUser provided)
    let assistantCtx: AssistantUserContext | undefined;
    if (context?.tenantId && context?.sessionUser) {
        assistantCtx = buildAssistantContext(
            context.sessionUser,
            context.tenantId,
        );
    }

    // 3. Load or create conversation
    let activeConversationId = context?.conversationId;
    let _conversationSummary: string | undefined;
    let conversationHistory: Array<{
        role: 'user' | 'assistant';
        content: string;
    }> = [];

    if (context?.tenantId && context?.sessionUser?.id) {
        const channelValue =
            input.channel === 'telegram_mini_app'
                ? 'telegram_mini_app'
                : input.channel === 'telegram'
                    ? 'telegram'
                    : 'web';
        const conversation = await getOrCreateConversation({
            tenantId: context.tenantId,
            userId: context.sessionUser.id,
            conversationId: activeConversationId,
            channel: channelValue,
        });
        activeConversationId = conversation.id;

        // Load conversation context
        const convContext = await loadConversationContext(conversation.id);
        _conversationSummary = convContext.summary;
        conversationHistory = buildLlmHistory(convContext);
    }

    // 3. LLM setup
    const apiKey =
        process.env.LLM_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.OPENROUTER_API_KEY ||
        process.env.FIREWORKS_API_KEY ||
        '';
    const baseURL =
        process.env.LLM_BASE_URL ||
        (process.env.FIREWORKS_API_KEY && !process.env.LLM_BASE_URL
            ? 'https://api.fireworks.ai/inference/v1'
            : 'http://localhost:11434/v1');
    const model =
        process.env.LLM_MODEL ||
        process.env.FIREWORKS_MODEL_ID ||
        'deepseek-r1:7b';

    const openai = new OpenAI({ apiKey, baseURL });

    // 4. Build tool set (filtered by permission)
    const availableTools = assistantCtx ? getToolsForContext(assistantCtx) : [];

    const openAiTools = toolsToOpenAiFormat(availableTools);

    const greeting = input.requesterName
        ? `Sapa user dengan nama ${input.requesterName} di awal pesan Anda.`
        : '';

    // 5. Build system prompt
    const toolList = availableTools
        .map((t) => `- ${t.name}: ${t.description}`)
        .join('\n');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: `Anda adalah Asisten Kerja Polyflow — asisten cerdas, ramah, dan interaktif yang siap membantu karyawan memahami dan mengoperasikan sistem ERP pabrik plastik Polyflow.

Gaya Komunikasi:
- Gunakan bahasa Indonesia yang santai, sopan, ramah, dan mudah dipahami.
- Berikan penjelasan langkah demi langkah yang terstruktur rapi dengan poin-poin.
- ${greeting}

Aturan Penting:
1. Anda bekerja dalam mode Read-Only. Anda TIDAK DAPAT membuat, mengubah, menghapus, approve, post, atau void transaksi.
2. Jika user meminta operasi tulis, arahkan ke menu UI yang sesuai dan JANGAN melakukannya.
3. Gunakan tools yang tersedia untuk mengambil data. Jika tool tidak tersedia karena permission, jelaskan dengan jelas.

Jenis Pertanyaan:
- CARA PAKAI / tutorial: gunakan search_help_articles, lalu jelaskan hasilnya.
- DATA OPERASIONAL (stok, SO, SPK, invoice, dll): gunakan tools data yang sesuai.
- DIAGNOSIS ("kenapa"): gunakan beberapa tools untuk investigasi.
- AMBIGUOUS: minta klarifikasi spesifik.

Aturan Evidence:
- Jawaban harus didukung oleh data dari tools atau artikel.
- Jangan mengarang nomor transaksi, customer, produk, atau penyebab.
- Jika evidence tidak cukup, gunakan frasa "belum dapat dipastikan dari data yang tersedia".
- Sertakan sumber data di akhir jawaban.

Aturan Diagnosis (untuk pertanyaan "kenapa"):
- Gabungkan data dari beberapa tools untuk menemukan akar masalah.
- Sebutkan blocker utama dan blocker tambahan.
- Jika ada data yang tidak bisa diakses karena permission, nyatakan dengan jelas.
- Selalu sertakan "Langkah berikutnya:" dengan menu/polyflow path yang harus dibuka user.
- Contoh: "Langkah berikutnya: Buka menu Sales > Orders untuk melihat detail SO."

Tools yang tersedia:
${toolList || 'Tidak ada data tools yang tersedia untuk Anda saat ini.'}

Di akhir jawaban, tawarkan bantuan atau pertanyaan lanjutan yang relevan secara ramah.`,
        },
    ];

    // 6. Add conversation history (loaded from DB)
    if (conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
            messages.push({ role: msg.role, content: msg.content });
        }
    }

    // 7. Add current question (with pronoun resolution for follow-ups)
    let userQuestion = input.question;
    if (activeConversationId) {
        const convContext = await loadConversationContext(activeConversationId);
        const pronounResult = resolvePronouns(
            input.question,
            convContext.resolvedEntities,
        );
        if (pronounResult.wasPronoun) {
            userQuestion = pronounResult.resolved;
            messages.push({
                role: 'system',
                content: `[User merujuk ke: ${userQuestion}]`,
            });
        }

        // Re-query hint: if follow-up asks for current/updated data, force fresh tool calls
        const timeSensitivePattern =
            /\b(sekarang|saat\s+ini|terbaru|update|terkini|latest|real[\s-]?time|refresh)\b/i;
        if (timeSensitivePattern.test(input.question)) {
            messages.push({
                role: 'system',
                content:
                    '[IMPORTANT: User meminta data terkini. WAJIB panggil tools lagi untuk mendapatkan data terbaru, jangan gunakan data dari pesan sebelumnya.]',
            });
        }
    }
    messages.push({ role: 'user', content: userQuestion });

    try {
        let finalAnswer = '';
        const collectedCited: CitedArticleForResponse[] = [];
        const collectedEvidence: ToolEvidence[] = [];

        // Agentic Loop (max 4 iterations)
        for (let loop = 0; loop < 4; loop++) {
            const completion = await openai.chat.completions.create({
                model,
                messages,
                temperature: 0.3,
                tools:
                    openAiTools.length > 0
                        ? (openAiTools as OpenAI.Chat.Completions.ChatCompletionTool[])
                        : undefined,
                tool_choice: openAiTools.length > 0 ? 'auto' : undefined,
            });

            const responseMessage = completion.choices[0]?.message;
            if (!responseMessage) break;

            messages.push(responseMessage);

            if (
                responseMessage.tool_calls &&
                responseMessage.tool_calls.length > 0
            ) {
                for (const toolCall of responseMessage.tool_calls) {
                    const fn = (
                        toolCall as OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall
                    ).function;
                    const toolName = fn.name;
                    const rawArgs = JSON.parse(fn.arguments || '{}');

                    if (AGENTIC_DEBUG) {
                        console.debug(
                            `[AGENTIC] Calling tool: ${toolName} with args:`,
                            rawArgs,
                        );
                    }

                    // Get tool definition
                    const toolDef = getToolByName(toolName);
                    if (!toolDef) {
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: `Error: Tool '${toolName}' tidak dikenali.`,
                        } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
                        continue;
                    }

                    // Authorization check (double-check before execution)
                    if (assistantCtx) {
                        const authResult = checkToolAuthorization(
                            toolDef,
                            assistantCtx,
                        );
                        if (!authResult.allowed) {
                            if (AGENTIC_DEBUG) {
                                console.debug(
                                    `[AGENTIC] Tool ${toolName} DENIED: ${authResult.reason}`,
                                );
                            }
                            messages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: `Akses ditolak: ${authResult.reason}`,
                            } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);

                            // Log tool execution as denied
                            logToolExecution({
                                conversationId: activeConversationId,
                                toolName,
                                permissionResource:
                                    toolDef.requiredResources.join(','),
                                allowed: false,
                                outcome: 'DENIED',
                                durationMs: 0,
                            });
                            continue;
                        }
                    }

                    // Validate input with Zod schema
                    const parseResult = toolDef.inputSchema.safeParse(rawArgs);
                    if (!parseResult.success) {
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: `Input tidak valid: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
                        } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
                        continue;
                    }

                    // Execute tool with timeout
                    const startTime = Date.now();
                    const TOOL_TIMEOUT_MS = 15_000; // 15 seconds per tool
                    try {
                        const evidence = await Promise.race([
                            toolDef.execute(parseResult.data, assistantCtx!),
                            new Promise<never>((_, reject) =>
                                setTimeout(
                                    () => reject(new Error('Tool timeout')),
                                    TOOL_TIMEOUT_MS,
                                ),
                            ),
                        ]);
                        collectedEvidence.push(evidence);

                        // Collect cited articles from search_help_articles
                        if (toolName === 'search_help_articles') {
                            // Extract articles from evidence entities
                            for (const entity of evidence.entities || []) {
                                if (
                                    entity.type === 'HelpArticle' &&
                                    entity.href
                                ) {
                                    const slug = entity.id;
                                    if (
                                        !collectedCited.some(
                                            (c) => c.slug === slug,
                                        )
                                    ) {
                                        collectedCited.push({
                                            slug,
                                            title: entity.label,
                                            summary: evidence.facts.find(
                                                (f) => f.label === entity.label,
                                            )?.value,
                                        });
                                    }
                                }
                            }
                        }

                        const durationMs = Date.now() - startTime;
                        const evidenceText = evidenceToText(evidence);

                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: evidenceText,
                        } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);

                        // Log successful tool execution
                        logToolExecution({
                            conversationId: activeConversationId,
                            toolName,
                            permissionResource:
                                toolDef.requiredResources.join(','),
                            allowed: true,
                            outcome: 'SUCCESS',
                            durationMs,
                        });
                    } catch (execError) {
                        const durationMs = Date.now() - startTime;
                        const errorMsg =
                            execError instanceof Error
                                ? execError.message
                                : 'Unknown error';

                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: `Error executing tool ${toolName}: ${errorMsg}`,
                        } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);

                        logToolExecution({
                            conversationId: activeConversationId,
                            toolName,
                            permissionResource:
                                toolDef.requiredResources.join(','),
                            allowed: true,
                            outcome: 'ERROR',
                            durationMs,
                        });
                    }
                }
            } else {
                finalAnswer = responseMessage.content?.trim() || '';
                break;
            }
        }

        const citedArticles = collectedCited.slice(0, 3);

        // Fetch related articles from same modules (exclude already cited)
        const relatedArticles: CitedArticleForResponse[] = [];
        if (citedArticles.length > 0) {
            const citedSlugs = new Set(citedArticles.map((a) => a.slug));
            const modules = [
                ...new Set(citedArticles.flatMap((a) => a.modules || [])),
            ];
            for (const mod of modules.slice(0, 2)) {
                const related = await searchHelpArticles('', mod, 4);
                for (const r of related) {
                    if (!citedSlugs.has(r.slug) && relatedArticles.length < 4) {
                        relatedArticles.push({
                            slug: r.slug,
                            title: r.title,
                            summary: r.summary?.slice(0, 80),
                            modules: r.modules,
                        });
                        citedSlugs.add(r.slug);
                    }
                }
            }
        }

        // Analyze for clarification needs
        const clarification = analyzeForClarification(
            input.question,
            collectedEvidence,
            conversationHistory,
        );

        // Calculate confidence score
        const confidence = calculateConfidence(
            collectedEvidence,
            clarification.needsClarification,
        );

        // Build evidence chips for UI
        const evidenceChips = collectedEvidence.map((e) => ({
            source: e.source,
            label:
                e.source === 'tenant-data'
                    ? `Data tenant — dicek ${formatTimeWib(e.checkedAt)}`
                    : e.source === 'global-kb'
                      ? 'Panduan resmi Polyflow'
                      : e.source === 'tenant-kb'
                        ? 'SOP internal perusahaan'
                        : 'Audit log',
            checkedAt: e.checkedAt,
        }));

        // 8. Save conversation messages (fire-and-forget, non-blocking)
        if (activeConversationId) {
            const answerText =
                finalAnswer ||
                'Maaf, saya belum dapat merangkum analisis pada saat ini.';
            saveMessage({
                conversationId: activeConversationId,
                role: 'USER',
                content: input.question,
            }).catch(() => {
                /* non-blocking */
            });
            saveMessage({
                conversationId: activeConversationId,
                role: 'ASSISTANT',
                content: answerText,
                evidenceJson: {
                    entities: collectedEvidence.flatMap(
                        (e) => e.entities || [],
                    ),
                },
            }).catch(() => {
                /* non-blocking */
            });
        }

        return {
            answer:
                finalAnswer ||
                'Maaf, saya belum dapat merangkum analisis pada saat ini.',
            citations: ['db:polyflow-agentic', 'api:llm-tools'],
            citedArticles,
            relatedArticles,
            evidence: evidenceChips,
            conversationId: activeConversationId,
            needsClarification: clarification.needsClarification,
            suggestions: clarification.suggestions,
            confidence,
            safety: { allowed: true },
        };
    } catch (error) {
        const e = error as Error;
        console.error('[ASSISTANT_LLM] Failed:', e?.message || e);

        // Smart Fallback: Search Knowledge Base directly
        try {
            const fallbackResults = await searchHelpArticles(
                input.question,
                undefined,
                4,
            );
            if (fallbackResults.length > 0) {
                const citedArticles: CitedArticleForResponse[] = fallbackResults
                    .slice(0, 3)
                    .map((r) => ({
                        slug: r.slug,
                        title: r.title,
                        summary: r.summary?.slice(0, 120),
                        modules: r.modules,
                    }));

                const articleLines = fallbackResults
                    .map(
                        (r, i) =>
                            `${i + 1}. **[${r.title}](/support/${r.slug})**\n   ${r.summary}`,
                    )
                    .join('\n\n');

                return {
                    answer: `Halo! Saat ini jaringan AI sedang lambat, tetapi saya tetap menemukan beberapa artikel panduan Knowledge Base yang relevan untuk pertanyaan Anda:\n\n${articleLines}\n\nSilakan klik salah satu artikel di atas atau kunjungi pusat bantuan kami di [Pusat Bantuan](/support).`,
                    citations: ['kb:direct-fallback'],
                    citedArticles,
                    safety: { allowed: true },
                };
            }
        } catch {
            /* ignore fallback error */
        }

        return {
            answer: 'Maaf, layanan AI sedang mengalami kendala koneksi sementara. Anda bisa melihat daftar panduan lengkap di menu [Pusat Bantuan](/support) atau mencoba bertanya kembali beberapa saat lagi.',
            citations: [],
            safety: {
                allowed: false,
                blockedReason: 'LLM Provider / Network Error',
            },
        };
    }
}

// ---------------------------------------------------------------------------
// Tool execution logging — persist to HelpToolExecution (fire-and-forget)
// ---------------------------------------------------------------------------

function logToolExecution(entry: {
    conversationId?: string;
    toolName: string;
    permissionResource: string;
    allowed: boolean;
    outcome: string;
    durationMs: number;
}) {
    if (AGENTIC_DEBUG) {
        console.debug(
            `[TOOL_AUDIT] ${entry.toolName} | allowed=${entry.allowed} | outcome=${entry.outcome} | ${entry.durationMs}ms`,
        );
    }

    // Persist to DB (fire-and-forget, never blocks response)
    prisma.helpToolExecution
        .create({
            data: {
                conversationId: entry.conversationId || '',
                toolName: entry.toolName,
                permissionResource: entry.permissionResource,
                allowed: entry.allowed,
                outcome: entry.outcome,
                durationMs: entry.durationMs,
            },
        })
        .catch(() => {
            /* non-blocking */
        });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeWib(iso: string): string {
    return new Date(iso).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
    });
}
