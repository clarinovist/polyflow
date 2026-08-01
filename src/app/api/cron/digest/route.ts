import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/core/cron-auth';
import { runDigest } from '@/lib/telegram/digest/digest-service';

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return new NextResponse(auth.body, { status: auth.status });
  }

  try {
    const result = await runDigest();
    return NextResponse.json({
      findings: result.findings.length,
      recipients: result.recipients,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[DIGEST] route error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
