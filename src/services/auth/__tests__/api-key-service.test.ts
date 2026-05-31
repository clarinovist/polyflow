import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyService } from '../api-key-service';
import crypto from 'crypto';

const { mockPrisma } = vi.hoisted(() => {
    const prisma = {
        apiKey: {
            create: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
        },
    };
    return { mockPrisma: prisma };
});

vi.mock('@/lib/core/prisma', () => ({
    prisma: mockPrisma,
}));

describe('ApiKeyService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('createApiKey', () => {
        it('generates, hashes, and stores a new API key', async () => {
            const mockCreatedKey = {
                id: 'key-123',
                name: 'Test Key',
                userId: 'user-1',
                expiresAt: new Date('2026-06-10T12:00:00.000Z'),
                isActive: true,
                key: 'will_be_overwritten_below',
            };

            mockPrisma.apiKey.create.mockResolvedValue(mockCreatedKey);

            const result = await ApiKeyService.createApiKey('Test Key', 'user-1', 10);

            expect(mockPrisma.apiKey.create).toHaveBeenCalledTimes(1);
            const callArgs = mockPrisma.apiKey.create.mock.calls[0][0];
            expect(callArgs.data.name).toBe('Test Key');
            expect(callArgs.data.userId).toBe('user-1');
            expect(callArgs.data.expiresAt.toISOString()).toBe('2026-06-10T12:00:00.000Z');
            
            // Check that the stored key is a SHA-256 hash (64 hex characters)
            expect(callArgs.data.key).toMatch(/^[a-f0-9]{64}$/);

            // Should return plain key pk_*
            expect(result.key).toMatch(/^pk_[a-f0-9]{64}$/);
            expect(result.id).toBe('key-123');
        });
    });

    describe('validateApiKey', () => {
        const plainKey = 'pk_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        const hashedKey = crypto.createHash('sha256').update(plainKey).digest('hex');

        it('validates a valid hashed API key successfully using direct lookup', async () => {
            const mockApiKeyRecord = {
                id: 'key-123',
                key: hashedKey,
                name: 'Production App',
                userId: 'user-2',
                isActive: true,
                expiresAt: null,
                user: { id: 'user-2', name: 'User 2', email: 'user2@example.com' },
            };

            mockPrisma.apiKey.findUnique.mockResolvedValueOnce(mockApiKeyRecord);

            const result = await ApiKeyService.validateApiKey(plainKey);

            expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledTimes(1);
            expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith({
                where: { key: hashedKey },
                include: { user: true },
            });
            expect(result).toEqual(mockApiKeyRecord);
        });

        it('falls back to plaintext direct lookup for legacy keys', async () => {
            const legacyPlainKey = 'pk_legacy_plain_text';
            const mockApiKeyRecord = {
                id: 'key-456',
                key: legacyPlainKey,
                name: 'Legacy App',
                userId: 'user-3',
                isActive: true,
                expiresAt: null,
                user: { id: 'user-3', name: 'User 3', email: 'user3@example.com' },
            };

            // Hashed lookup returns null, plain lookup returns the record
            mockPrisma.apiKey.findUnique
                .mockResolvedValueOnce(null) // Hashed lookup
                .mockResolvedValueOnce(mockApiKeyRecord); // Plain lookup

            const result = await ApiKeyService.validateApiKey(legacyPlainKey);

            expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledTimes(2);
            expect(mockPrisma.apiKey.findUnique).toHaveBeenNthCalledWith(1, {
                where: { key: crypto.createHash('sha256').update(legacyPlainKey).digest('hex') },
                include: { user: true },
            });
            expect(mockPrisma.apiKey.findUnique).toHaveBeenNthCalledWith(2, {
                where: { key: legacyPlainKey },
                include: { user: true },
            });
            expect(result).toEqual(mockApiKeyRecord);
        });

        it('returns null if the key does not exist', async () => {
            mockPrisma.apiKey.findUnique.mockResolvedValue(null);

            const result = await ApiKeyService.validateApiKey(plainKey);

            expect(result).toBeNull();
        });

        it('returns null if the key is inactive', async () => {
            const mockApiKeyRecord = {
                id: 'key-123',
                key: hashedKey,
                isActive: false,
                expiresAt: null,
            };

            mockPrisma.apiKey.findUnique.mockResolvedValueOnce(mockApiKeyRecord);

            const result = await ApiKeyService.validateApiKey(plainKey);

            expect(result).toBeNull();
        });

        it('returns null if the key is expired', async () => {
            const mockApiKeyRecord = {
                id: 'key-123',
                key: hashedKey,
                isActive: true,
                expiresAt: new Date('2026-05-30T12:00:00.000Z'), // Past
            };

            mockPrisma.apiKey.findUnique.mockResolvedValueOnce(mockApiKeyRecord);

            const result = await ApiKeyService.validateApiKey(plainKey);

            expect(result).toBeNull();
        });
    });

    describe('revokeApiKey', () => {
        it('marks an API key as inactive', async () => {
            mockPrisma.apiKey.update.mockResolvedValue({ id: 'key-123', isActive: false });

            const result = await ApiKeyService.revokeApiKey('key-123');

            expect(mockPrisma.apiKey.update).toHaveBeenCalledTimes(1);
            expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
                where: { id: 'key-123' },
                data: { isActive: false },
            });
            expect(result.isActive).toBe(false);
        });
    });
});
