import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Auth Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Module initialization', () => {
        it('should export auth, signIn, signOut, and handlers', async () => {
            // Arrange & Act
            const authModule = await import('@/auth');

            // Assert
            expect(authModule.auth).toBeDefined();
            expect(authModule.signIn).toBeDefined();
            expect(authModule.signOut).toBeDefined();
            expect(authModule.handlers).toBeDefined();
        });

        it('should have auth as a function', async () => {
            // Arrange & Act
            const { auth } = await import('@/auth');

            // Assert
            expect(typeof auth).toBe('function');
        });

        it('should have signIn as a function', async () => {
            // Arrange & Act
            const { signIn } = await import('@/auth');

            // Assert
            expect(typeof signIn).toBe('function');
        });

        it('should have signOut as a function', async () => {
            // Arrange & Act
            const { signOut } = await import('@/auth');

            // Assert
            expect(typeof signOut).toBe('function');
        });
    });
});
