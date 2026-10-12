import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { toBusinessDateString } from '@/lib/utils/timezone';
import {
    diagnoseProductionOrder,
    getProductionBriefing,
    getProductionOutputForBusinessDate,
} from '@/services/production/assistant-production-query-service';
import type {
    AssistantToolDefinition,
    AssistantUserContext,
    ToolEvidence,
} from './assistant-types';
import { checkToolAuthorization } from './tool-authorization';
import {
    dailyProductionOutputEvidence,
    productionBriefingEvidence,
    productionDiagnosisEvidence,
} from './production-evidence';

function previousWibBusinessDate(now = new Date()): string {
    const today = toBusinessDateString(now);
    const [year, month, day] = today.split('-').map(Number);
    const previous = new Date(Date.UTC(year, month - 1, day - 1));
    return previous.toISOString().slice(0, 10);
}

function productionTool<T extends z.ZodType>(
    name: string,
    description: string,
    requiredResources: string[],
    inputSchema: T,
    execute: (
        tx: Prisma.TransactionClient,
        input: z.output<T>,
    ) => Promise<ToolEvidence>,
): AssistantToolDefinition {
    const policy = {
        name,
        requiredResources,
        sensitivity: 'normal' as const,
    };
    return {
        ...policy,
        description,
        inputSchema,
        execute: async (raw, context: AssistantUserContext) => {
            if (
                !context?.userId ||
                !checkToolAuthorization(policy, context).allowed
            ) {
                throw new Error('Akses produksi ditolak.');
            }
            const db = tenantContext.getStore();
            const tenantId = tenantIdContext.getStore();
            if (!db || !tenantId || tenantId !== context.tenantId) {
                throw new Error(
                    'Konteks tenant aktif tidak cocok; muat ulang sesi.',
                );
            }
            const input = inputSchema.parse(raw);
            try {
                return await db.$transaction(
                    async (tx) => {
                        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
                        return execute(tx, input);
                    },
                    {
                        isolationLevel:
                            Prisma.TransactionIsolationLevel.RepeatableRead,
                        timeout: 12_000,
                        maxWait: 2_000,
                    },
                );
            } catch (error) {
                console.error('[production-tool] read-only query failed', {
                    tool: name,
                    errorType:
                        error instanceof Prisma.PrismaClientKnownRequestError
                            ? error.code
                            : 'UNEXPECTED',
                });
                throw new Error(
                    'Pemeriksaan produksi gagal; data belum dapat diverifikasi. Coba lagi atau hubungi administrator.',
                );
            }
        },
    };
}

export const productionTools: AssistantToolDefinition[] = [
    productionTool(
        'diagnose_production_blocker',
        'Diagnosis read-only satu SPK melalui ID/nomor persis atau pencarian nomor. Memeriksa status, progres, tanggal, mesin yang diassign, issue terbuka, rencana material, issue/stage dan stok eligible. Hasil ambigu memerlukan pilihan.',
        ['/production/orders', '/warehouse/inventory'],
        z.object({ searchTerm: z.string().trim().min(1).max(100) }),
        async (tx, input) =>
            productionDiagnosisEvidence(
                await diagnoseProductionOrder(tx, input.searchTerm),
            ),
    ),
    productionTool(
        'get_daily_production_output',
        'Output produksi aktual read-only untuk satu tanggal bisnis WIB. Gunakan untuk pertanyaan produksi hari ini, kemarin, atau tanggal tertentu; membaca ProductionExecution non-VOIDED, bukan target SPK. Tanpa argumen, default kemarin WIB. Hasil memisahkan proses dan satuan serta tidak membuat grand total lintas proses/satuan.',
        ['/production/output-report'],
        z.object({
            date: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus YYYY-MM-DD')
                .optional()
                .describe('Tanggal bisnis WIB YYYY-MM-DD; kosong berarti kemarin WIB.'),
        }),
        async (tx, input) =>
            dailyProductionOutputEvidence(
                await getProductionOutputForBusinessDate(
                    tx,
                    input.date ?? previousWibBusinessDate(),
                ),
            ),
    ),
    productionTool(
        'get_production_priority_briefing',
        'Briefing read-only maksimal 20 SPK aktif/perlu ditinjau. Urut plannedEndDate, lalu priority dan nomor SPK; bukan optimasi jadwal dan bukan pemeriksaan material tiap SPK.',
        ['/production/orders'],
        z.object({}),
        async (tx) =>
            productionBriefingEvidence(await getProductionBriefing(tx)),
    ),
];
