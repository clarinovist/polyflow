import type { AssistantUserContext } from './assistant-types';

type SessionUser = {
  id?: string;
  name?: string | null;
  role?: string;
  roles?: string[];
  isSuperAdmin?: boolean;
  allowedResources?: string[] | 'ALL';
};

/**
 * Build AssistantUserContext from NextAuth session and tenant context.
 * All identity and permission fields come from the server — never from the client.
 */
export function buildAssistantContext(sessionUser: SessionUser, tenantId: string): AssistantUserContext {
  const allowedResources = sessionUser.isSuperAdmin
    ? 'ALL'
    : sessionUser.allowedResources ?? [];

  return {
    userId: sessionUser.id ?? '',
    requesterName: sessionUser.name ?? undefined,
    activeRole: sessionUser.role,
    roles: sessionUser.roles ?? (sessionUser.role ? [sessionUser.role] : []),
    allowedResources,
    tenantId,
    channel: 'web',
    locale: 'id-ID',
  };
}
