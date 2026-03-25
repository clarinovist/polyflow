import { vi } from 'vitest';

// Global mocks for essential application services and database
vi.mock('@/lib/core/prisma', async () => {
    const { createMockPrisma } = await import('./helpers/createMockPrisma');
    return {
        prisma: createMockPrisma()
    };
});

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

// Mock Next Auth to prevent environment import errors in Vitest
vi.mock('@/auth', () => ({
    auth: vi.fn(() => Promise.resolve({ user: { id: 'test-user', name: 'Test User' } })),
    signIn: vi.fn(),
    signOut: vi.fn()
}));

// Mock next/server if any services import NextResponse or NextRequest
vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn(),
        next: vi.fn()
    },
    NextRequest: vi.fn()
}));

// Mock next/headers
vi.mock('next/headers', () => ({
    headers: vi.fn(() => Promise.resolve({
        get: () => null
    })),
    cookies: vi.fn(() => Promise.resolve({
        get: vi.fn()
    }))
}));
