import { Prisma } from '@prisma/client';

// Kiosk-origin QC measurements are informational — result selalu 'PASS' di
// sini, tidak pernah dihitung otomatis dari isWithinTolerance. Alasan: ada
// gate terpisah (routing-execution-guard.ts, requiresQualityGate) yang block
// downstream order kalau QualityInspection terbaru result != 'PASS'. Kalau
// hasil di-auto-set 'FAIL' saat satu measurement meleset toleransi, gate itu
// ikut ke-trigger diam-diam — bertentangan dengan keputusan "warning saja,
// tidak block" untuk step QC kiosk (docs/plan/2026-08-11-qc-kiosk-parametric-checkpoint.md).
// Downgrade ke FAIL/QUARANTINE tetap manual lewat RecordQCDialog di desktop.
export async function recordExecutionQualityInspection(params: {
    tx: Prisma.TransactionClient;
    productionOrderId: string;
    executionId: string;
    measurements: { parameterId: string; value: number }[];
    userId?: string;
}) {
    const { tx, productionOrderId, executionId, measurements, userId } = params;

    if (measurements.length === 0) {
        return;
    }

    const parameters = await tx.qualityCheckParameter.findMany({
        where: { id: { in: measurements.map((m) => m.parameterId) } },
    });
    const parameterById = new Map(parameters.map((p) => [p.id, p]));

    const inspection = await tx.qualityInspection.create({
        data: {
            productionOrderId,
            productionExecutionId: executionId,
            inspectorId: userId,
            result: 'PASS',
        },
    });

    await tx.qualityInspectionMeasurement.createMany({
        data: measurements.flatMap(({ parameterId, value }) => {
            const parameter = parameterById.get(parameterId);
            if (!parameter) return [];

            const min =
                parameter.minValue !== null ? Number(parameter.minValue) : null;
            const max =
                parameter.maxValue !== null ? Number(parameter.maxValue) : null;
            const isWithinTolerance =
                (min === null || value >= min) &&
                (max === null || value <= max);

            return [
                {
                    qualityInspectionId: inspection.id,
                    parameterId,
                    parameterName: parameter.name,
                    parameterUnit: parameter.unit,
                    measuredValue: value,
                    isWithinTolerance,
                },
            ];
        }),
    });
}
