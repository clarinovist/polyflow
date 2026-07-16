import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { buildPieceSnapshotForOperator, calcPieceEarnings } from '../piece-rate-helpers';

describe('buildPieceSnapshotForOperator', () => {
  const mockDb = {
    employee: { findUnique: vi.fn() },
    machine: { findUnique: vi.fn() },
    processPieceRate: { findUnique: vi.fn() },
  };

  beforeEach(() => vi.clearAllMocks());

  it('returns empty for DAILY operator', async () => {
    vi.mocked(mockDb.employee.findUnique).mockResolvedValue({ payType: 'DAILY' } as any);
    const snap = await buildPieceSnapshotForOperator(mockDb as any, {
      operatorId: 'op-1',
      machineId: 'm-1',
      quantityProduced: 100,
    });
    expect(snap.pieceEarnings).toBeNull();
    expect(mockDb.processPieceRate.findUnique).not.toHaveBeenCalled();
  });

  it('snapshots rate × qty for PIECE operator', async () => {
    vi.mocked(mockDb.employee.findUnique).mockResolvedValue({ payType: 'PIECE' } as any);
    vi.mocked(mockDb.machine.findUnique).mockResolvedValue({ type: 'EXTRUDER' } as any);
    vi.mocked(mockDb.processPieceRate.findUnique).mockResolvedValue({
      ratePerKg: new Prisma.Decimal(150),
      status: 'ACTIVE',
    } as any);

    const snap = await buildPieceSnapshotForOperator(mockDb as any, {
      operatorId: 'op-1',
      machineId: 'm-1',
      quantityProduced: 100,
    });

    expect(Number(snap.pieceRateSnapshot)).toBe(150);
    expect(Number(snap.pieceEarnings)).toBe(calcPieceEarnings(100, 150));
    expect(snap.pieceMachineType).toBe('EXTRUDER');
  });

  it('soft-fails when rate missing (machine type set, earnings null)', async () => {
    vi.mocked(mockDb.employee.findUnique).mockResolvedValue({ payType: 'PIECE' } as any);
    vi.mocked(mockDb.machine.findUnique).mockResolvedValue({ type: 'PACKER' } as any);
    vi.mocked(mockDb.processPieceRate.findUnique).mockResolvedValue(null);

    const snap = await buildPieceSnapshotForOperator(mockDb as any, {
      operatorId: 'op-1',
      machineId: 'm-1',
      quantityProduced: 50,
    });

    expect(snap.pieceMachineType).toBe('PACKER');
    expect(snap.pieceEarnings).toBeNull();
    expect(snap.pieceRateSnapshot).toBeNull();
  });
});
