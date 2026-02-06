import { prisma } from './prisma';

/**
 * Get next sequence number for a given key
 * @param key - Sequence key (e.g., 'PAYMENT_IN', 'PAYMENT_OUT')
 * @returns Formatted sequence number (e.g., 'PAY-IN-00001')
 */
export async function getNextSequence(key: string): Promise<string> {
    const result = await prisma.$transaction(async (tx) => {
        // Get or create sequence
        let sequence = await tx.systemSequence.findUnique({
            where: { key }
        });

        if (!sequence) {
            sequence = await tx.systemSequence.create({
                data: { key, value: BigInt(1) }
            });
            return BigInt(1);
        }

        // Increment and return
        const nextValue = sequence.value + BigInt(1);
        await tx.systemSequence.update({
            where: { key },
            data: { value: nextValue }
        });

        return nextValue;
    });

    // Format based on key
    const paddedNumber = result.toString().padStart(5, '0');

    switch (key) {
        case 'PAYMENT_IN':
            return `PAY-IN-${paddedNumber}`;
        case 'PAYMENT_OUT':
            return `PAY-OUT-${paddedNumber}`;
        default:
            return `${key}-${paddedNumber}`;
    }
}
