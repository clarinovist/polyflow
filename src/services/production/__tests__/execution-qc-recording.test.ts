import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordExecutionQualityInspection } from '../execution-qc-recording';

const createTx = () => ({
    qualityCheckParameter: {
        findMany: vi.fn(),
    },
    qualityInspection: {
        create: vi.fn(),
    },
    qualityInspectionMeasurement: {
        createMany: vi.fn(),
    },
});

describe('recordExecutionQualityInspection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does nothing when there are no measurements', async () => {
        const tx = createTx();

        await recordExecutionQualityInspection({
            tx: tx as any,
            productionOrderId: 'po-1',
            executionId: 'exec-1',
            measurements: [],
            userId: 'user-1',
        });

        expect(tx.qualityCheckParameter.findMany).not.toHaveBeenCalled();
        expect(tx.qualityInspection.create).not.toHaveBeenCalled();
    });

    it('always creates the inspection with result PASS, even when a measurement is out of tolerance', async () => {
        const tx = createTx();
        tx.qualityCheckParameter.findMany.mockResolvedValue([
            {
                id: 'param-1',
                name: 'Panjang Sedotan',
                unit: 'cm',
                minValue: 10,
                maxValue: 12,
            },
        ]);
        tx.qualityInspection.create.mockResolvedValue({ id: 'insp-1' });

        await recordExecutionQualityInspection({
            tx: tx as any,
            productionOrderId: 'po-1',
            executionId: 'exec-1',
            measurements: [{ parameterId: 'param-1', value: 15 }], // out of [10,12]
            userId: 'user-1',
        });

        expect(tx.qualityInspection.create).toHaveBeenCalledWith({
            data: {
                productionOrderId: 'po-1',
                productionExecutionId: 'exec-1',
                inspectorId: 'user-1',
                result: 'PASS',
            },
        });
    });

    it('flags isWithinTolerance=false when the measured value is below min or above max', async () => {
        const tx = createTx();
        tx.qualityCheckParameter.findMany.mockResolvedValue([
            {
                id: 'param-1',
                name: 'Panjang Sedotan',
                unit: 'cm',
                minValue: 10,
                maxValue: 12,
            },
            {
                id: 'param-2',
                name: 'Berat Sedotan',
                unit: 'gram',
                minValue: 2,
                maxValue: 3,
            },
        ]);
        tx.qualityInspection.create.mockResolvedValue({ id: 'insp-1' });

        await recordExecutionQualityInspection({
            tx: tx as any,
            productionOrderId: 'po-1',
            executionId: 'exec-1',
            measurements: [
                { parameterId: 'param-1', value: 8 }, // below min
                { parameterId: 'param-2', value: 2.5 }, // within range
            ],
        });

        expect(
            tx.qualityInspectionMeasurement.createMany,
        ).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    qualityInspectionId: 'insp-1',
                    parameterId: 'param-1',
                    parameterName: 'Panjang Sedotan',
                    parameterUnit: 'cm',
                    measuredValue: 8,
                    isWithinTolerance: false,
                }),
                expect.objectContaining({
                    qualityInspectionId: 'insp-1',
                    parameterId: 'param-2',
                    measuredValue: 2.5,
                    isWithinTolerance: true,
                }),
            ],
        });
    });

    it('treats a parameter with no min/max as always within tolerance', async () => {
        const tx = createTx();
        tx.qualityCheckParameter.findMany.mockResolvedValue([
            {
                id: 'param-1',
                name: 'Ketipisan',
                unit: 'mm',
                minValue: null,
                maxValue: null,
            },
        ]);
        tx.qualityInspection.create.mockResolvedValue({ id: 'insp-1' });

        await recordExecutionQualityInspection({
            tx: tx as any,
            productionOrderId: 'po-1',
            executionId: 'exec-1',
            measurements: [{ parameterId: 'param-1', value: 999 }],
        });

        expect(
            tx.qualityInspectionMeasurement.createMany,
        ).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    isWithinTolerance: true,
                }),
            ],
        });
    });

    it('skips measurements whose parameterId no longer resolves to a parameter', async () => {
        const tx = createTx();
        tx.qualityCheckParameter.findMany.mockResolvedValue([]); // deleted/unknown parameter
        tx.qualityInspection.create.mockResolvedValue({ id: 'insp-1' });

        await recordExecutionQualityInspection({
            tx: tx as any,
            productionOrderId: 'po-1',
            executionId: 'exec-1',
            measurements: [{ parameterId: 'param-deleted', value: 5 }],
        });

        expect(
            tx.qualityInspectionMeasurement.createMany,
        ).toHaveBeenCalledWith({ data: [] });
    });
});
