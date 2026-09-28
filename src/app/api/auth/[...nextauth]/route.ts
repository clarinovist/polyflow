import { handlers } from '@/auth';
import type { NextRequest } from 'next/server';
import { withPublicAuthUrl } from '@/lib/auth/public-auth-request';

export async function GET(request: NextRequest) {
    return handlers.GET(withPublicAuthUrl(request) as NextRequest);
}

export async function POST(request: NextRequest) {
    return handlers.POST(withPublicAuthUrl(request) as NextRequest);
}
