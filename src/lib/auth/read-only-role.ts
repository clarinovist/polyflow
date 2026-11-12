import { AuthorizationError } from '@/lib/errors/errors';
import { hasRole, type RoleBearer } from '@/lib/auth/roles';

export const READ_ONLY_FACTORY_MANAGER_MESSAGE =
    'Kepala pabrik hanya memiliki akses baca; aksi ini tidak diizinkan untuk peran Anda.';

/**
 * FACTORY_MANAGER is a monitoring/approval role. Without ADMIN it must never
 * run desktop write actions, even when the server action is called directly.
 */
export function isReadOnlyFactoryManager(user: RoleBearer): boolean {
    return hasRole(user, 'FACTORY_MANAGER') && !hasRole(user, 'ADMIN');
}

/** Rejects FACTORY_MANAGER-without-ADMIN; every other role passes untouched. */
export function assertNotReadOnlyFactoryManager(user: RoleBearer): void {
    if (isReadOnlyFactoryManager(user)) {
        throw new AuthorizationError(READ_ONLY_FACTORY_MANAGER_MESSAGE);
    }
}
