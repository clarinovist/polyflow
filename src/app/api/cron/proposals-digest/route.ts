import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/core/cron-auth';
import { runProposalsDigest } from '@/lib/telegram/proposals-digest';

export async function GET(req: Request) {
    const auth = verifyCronAuth(req);
    if (!auth.ok) {
        return new NextResponse(auth.body, { status: auth.status });
    }

    try {
        const result = await runProposalsDigest();
        return NextResponse.json({ ...result, executedAt: new Date().toISOString() });
    } catch (error) {
        console.error('[PROPOSALS-DIGEST] route error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
