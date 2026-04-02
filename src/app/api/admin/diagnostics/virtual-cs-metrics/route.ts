import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { getVirtualCsMetrics } from '@/lib/bot/metrics';

export async function GET() {
  const session = await auth();

  if (!session || session.user.role !== 'ADMIN') {
    return new NextResponse('Unauthorized. Only ADMIN can access virtual CS metrics.', { status: 401 });
  }

  return NextResponse.json({
    success: true,
    data: getVirtualCsMetrics(),
  });
}
