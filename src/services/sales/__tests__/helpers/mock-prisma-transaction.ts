import { vi } from "vitest";

/**
 * Delegates stubbed on a transaction client.
 *
 * Tests stub only the handful of models the service under test touches, never
 * the full Prisma client.
 */
export type MockTxClient = Record<string, unknown>;

type TransactionImpl = (
  run: (tx: MockTxClient) => Promise<unknown>
) => Promise<unknown>;

/**
 * Typed handle on a mocked `prisma.$transaction`.
 *
 * The real signature requires the callback to accept a full `PrismaClient`,
 * which a stub can never satisfy. Narrowing it once here keeps that cast in a
 * single place instead of repeating it at every `mockImplementation` call site.
 *
 * Usage:
 *   mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
 *     const tx = { customer: { findUnique: vi.fn() } };
 *     return fn(tx);
 *   });
 */
export function mockedTransaction(transaction: unknown) {
  return vi.mocked(transaction as TransactionImpl);
}
