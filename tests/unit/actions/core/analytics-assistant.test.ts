import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAndRunQuery } from '@/actions/core/analytics-assistant';
import { fireworks } from '@/lib/tools/fireworks';
import { auth } from '@/auth';

// Mock fireworks
vi.mock('@/lib/tools/fireworks', () => ({
    fireworks: {
        chat: {
            completions: {
                create: vi.fn(),
            },
        },
    },
    SQL_MODEL_ID: 'test-model',
}));

// Mock auth
vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
    headers: vi.fn().mockResolvedValue({
        get: vi.fn().mockReturnValue(null),
    }),
}));

// Mock @prisma/client
const mockQueryRawUnsafe = vi.fn();
vi.mock('@prisma/client', () => {
    return {
        PrismaClient: vi.fn().mockImplementation(() => ({
            $queryRawUnsafe: mockQueryRawUnsafe,
        })),
    };
});

describe('Analytics Assistant Security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { role: 'ADMIN' },
        });
    });

    const mockLLMResponse = (sql: string) => {
        (fireworks.chat.completions.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            choices: [{ message: { content: sql } }],
        });
    };

    it('should allow a valid SELECT query', async () => {
        mockLLMResponse('SELECT * FROM "Customer"');
        mockQueryRawUnsafe.mockResolvedValue([]);

        const result = await generateAndRunQuery('Show me all customers');

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.sql).toBe('SELECT * FROM "Customer"');
        }
    });

    it('should block queries with forbidden keywords (UPDATE)', async () => {
        mockLLMResponse('UPDATE "Customer" SET name = \'Hacked\'');

        const result = await generateAndRunQuery('Hack the database');

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('forbidden keywords');
        }
    });

    it('should block multi-statement queries (semicolon)', async () => {
        mockLLMResponse('SELECT * FROM "Customer"; DROP TABLE "User";');

        const result = await generateAndRunQuery('Show customers and drop users');

        expect(result.success).toBe(false);
    });

    it('should block SQL comments (--)', async () => {
        mockLLMResponse('SELECT * FROM "Customer" -- some comment');

        const result = await generateAndRunQuery('Show customers with comment');

        expect(result.success).toBe(false);
    });

    it('should block SQL comments (/* */)', async () => {
        mockLLMResponse('SELECT * FROM "Customer" /* nested comment */');

        const result = await generateAndRunQuery('Show customers with nested comment');

        expect(result.success).toBe(false);
    });

    it('should block queries not starting with SELECT or WITH', async () => {
        mockLLMResponse('INSERT INTO "Customer" (name) VALUES (\'New\')');

        const result = await generateAndRunQuery('Insert a customer');

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('Only SELECT queries are allowed');
        }
    });

    it('should allow keywords when part of a larger identifier (e.g., updatedAt) while blocking them as standalone keywords', async () => {
        // Test allowing 'updatedAt' as it's a common column name and should not be blocked by \bUPDATE\b
        mockLLMResponse('SELECT "updatedAt" FROM "Customer"');
        mockQueryRawUnsafe.mockResolvedValue([]);

        let result = await generateAndRunQuery('Show update times');
        expect(result.success).toBe(true);

        // Test blocking 'update' as a standalone keyword (case-insensitive)
        mockLLMResponse('update "Customer" set name = \'test\'');
        result = await generateAndRunQuery('Malicious update');
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('forbidden keyword: UPDATE');
        }
    });
});
