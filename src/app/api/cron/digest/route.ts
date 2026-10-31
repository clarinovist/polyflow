import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/core/cron-auth';
import { runDigest } from '@/lib/telegram/digest/digest-service';
import {
  runFindingsCycle,
  type FindingsCycleResult,
} from '@/lib/findings/findings-cycle';

// The Finding lifecycle and the legacy pilot Telegram digest are
// independent: a failure in one must not stop the other.
async function runFindingsCycleSafely(): Promise<
  FindingsCycleResult | { error: string }
> {
  try {
    return await runFindingsCycle();
  } catch (error) {
    console.error('[FINDINGS] cycle error:', error);
    return { error: 'findings cycle failed' };
  }
}

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return new NextResponse(auth.body, { status: auth.status });
  }

  try {
    const findingsCycle = await runFindingsCycleSafely();
    const result = await runDigest();
    return NextResponse.json({
      findings: result.findings.length,
      recipients: result.recipients,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      findingsCycle,
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
