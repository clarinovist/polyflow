import { describe, expect, it } from 'vitest';
import { assertConvertibleToLocal } from '@/services/auth/central-to-local-service';

describe('assertConvertibleToLocal', () => {
    it('lolos untuk CENTRAL + REVOKED tanpa undangan pending', () => {
        expect(() =>
            assertConvertibleToLocal(
                { id: 'u1', authMode: 'CENTRAL', centralAccountId: 'a1' },
                { membershipStatus: 'REVOKED', hasPendingInvitation: false },
            ),
        ).not.toThrow();
    });

    it('lolos untuk CENTRAL tanpa membership (null) tanpa undangan', () => {
        expect(() =>
            assertConvertibleToLocal(
                { id: 'u1', authMode: 'CENTRAL', centralAccountId: 'a1' },
                { membershipStatus: null, hasPendingInvitation: false },
            ),
        ).not.toThrow();
    });

    it('menolak akun yang sudah LOCAL', () => {
        expect(() =>
            assertConvertibleToLocal(
                { id: 'u1', authMode: 'LOCAL', centralAccountId: null },
                { membershipStatus: null, hasPendingInvitation: false },
            ),
        ).toThrow(/sudah lokal/);
    });

    it('menolak membership ACTIVE', () => {
        expect(() =>
            assertConvertibleToLocal(
                { id: 'u1', authMode: 'CENTRAL', centralAccountId: 'a1' },
                { membershipStatus: 'ACTIVE', hasPendingInvitation: false },
            ),
        ).toThrow(/Cabut akses/);
    });

    it('menolak undangan PENDING', () => {
        expect(() =>
            assertConvertibleToLocal(
                { id: 'u1', authMode: 'CENTRAL', centralAccountId: 'a1' },
                { membershipStatus: 'REVOKED', hasPendingInvitation: true },
            ),
        ).toThrow(/Batalkan undangan/);
    });

    it('menolak superadmin', () => {
        expect(() =>
            assertConvertibleToLocal(
                { id: 'u1', authMode: 'CENTRAL', centralAccountId: 'a1', isSuperAdmin: true },
                { membershipStatus: 'REVOKED', hasPendingInvitation: false },
            ),
        ).toThrow(/Super Admin/);
    });
});
