'use server';

import { z } from 'zod';
import { withTenant } from '@/lib/core/tenant';
import { getKioskOperatorSession } from '@/lib/auth/kiosk-operator-session';
import { requireModuleOrNextResponse } from '@/lib/modules/guard';
import { readKioskFeatureSettings } from '@/services/settings/kiosk-feature-service';
import { productionOutputSchema } from '@/lib/schemas/production';
import { BusinessRuleError, safeAction } from '@/lib/errors/errors';
import { ProductionExecutionService } from '@/services/production/execution-service';

const reportsSchema = z
    .array(
        productionOutputSchema.extend({
            clientRequestId: z.string().uuid('ID kiriman tidak valid.'),
            operatorId: z.string().min(1, 'Operator PIN wajib tersedia.'),
            // Actual packaging remains in the dedicated Catat Hasil wizard.
            packagedOutput: z
                .never({
                    error: 'Catat kemasan melalui Catat Hasil di fokus SPK.',
                })
                .optional(),
        }),
    )
    .min(1, 'Tambahkan setidaknya satu entri.')
    .max(100, 'Kirim paling banyak 100 entri sekaligus.');

/** POSTed on the kiosk page: uses the existing /kiosk-only PIN cookie and Next's CSRF guard. */
export const submitKioskDailyReports = withTenant(
    async function submitKioskDailyReports(input: unknown) {
        return safeAction(async () => {
            const operator = await getKioskOperatorSession();
            if (!operator)
                throw new BusinessRuleError(
                    'Sesi PIN berakhir. Kembali ke hub dan masuk dengan PIN lagi.',
                );
            if (await requireModuleOrNextResponse('PRODUCTION'))
                throw new BusinessRuleError('Modul produksi tidak tersedia.');
            if (!(await readKioskFeatureSettings()))
                throw new BusinessRuleError('Proses khusus tidak tersedia.');
            const parsed = reportsSchema.safeParse(input);
            if (!parsed.success)
                throw new BusinessRuleError(
                    'Isian laporan tidak valid. Periksa SPK, shift, jumlah, dan ID kiriman.',
                );
            if (
                parsed.data.some(
                    (report) => report.operatorId !== operator.employeeId,
                )
            ) {
                throw new BusinessRuleError(
                    'Sesi operator berubah. Masuk kembali sebagai operator pencatat sebelum mengirim ulang.',
                );
            }
            const results: { index: number }[] = [];
            const errors: { index: number; error: string }[] = [];
            for (const [index, report] of parsed.data.entries()) {
                const outcome = await safeAction(() =>
                    ProductionExecutionService.addProductionOutput({
                        ...report,
                        operatorId: operator.employeeId,
                        userId: 'system',
                        kioskOperator: {
                            employeeId: operator.employeeId,
                            code: operator.code,
                        },
                    }),
                );
                if (outcome.success) results.push({ index });
                else
                    errors.push({
                        index,
                        error:
                            outcome.code === 'INTERNAL_ERROR'
                                ? 'Gagal menyimpan entri. Silakan coba lagi.'
                                : outcome.error,
                    });
            }
            return {
                status: errors.length ? 207 : 200,
                count: results.length,
                results,
                errors,
            };
        });
    },
);
