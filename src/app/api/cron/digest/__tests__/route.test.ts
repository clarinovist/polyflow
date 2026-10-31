import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
  class MockNextResponse {
    status: number;
    _body: unknown;
    constructor(body?: unknown, init?: { status?: number }) {
      this._body = body;
      this.status = init?.status || 200;
    }
    async text() {
      return String(this._body);
    }
    async json() {
      return typeof this._body === 'string' ? JSON.parse(this._body) : this._body;
    }
    static json(body: unknown, init?: { status?: number }) {
      return new MockNextResponse(body, init);
    }
  }
  return { NextResponse: MockNextResponse };
});

vi.mock('@/lib/core/cron-auth', () => ({
  verifyCronAuth: vi.fn(),
}));

vi.mock('@/lib/telegram/digest/digest-service', () => ({
  runDigest: vi.fn(),
}));

vi.mock('@/lib/findings/findings-cycle', () => ({
  runFindingsCycle: vi.fn(),
}));

import { GET } from '../route';
import { verifyCronAuth } from '@/lib/core/cron-auth';
import { runDigest } from '@/lib/telegram/digest/digest-service';
import { runFindingsCycle } from '@/lib/findings/findings-cycle';

const mockVerifyCronAuth = vi.mocked(verifyCronAuth);
const mockRunDigest = vi.mocked(runDigest);
const mockRunFindingsCycle = vi.mocked(runFindingsCycle);

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/digest', {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  });
}

describe('GET /api/cron/digest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRunFindingsCycle.mockResolvedValue({ tenants: [{ tenant: 'tenant-a', mode: 'off' }] });
  });

  it('returns 401 when auth fails', async () => {
    mockVerifyCronAuth.mockReturnValue({ ok: false, status: 401, body: 'Unauthorized' });

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockRunFindingsCycle).not.toHaveBeenCalled();
  });

  it('returns digest summary on happy path', async () => {
    mockVerifyCronAuth.mockReturnValue({ ok: true });
    mockRunDigest.mockResolvedValue({
      findings: [{ detector: 'critical_stock', severity: 'critical', requiredResources: [], headline: 'Test' }],
      recipients: 2,
      sent: 2,
      skipped: 0,
      failed: 0,
    });

    const res = await GET(makeRequest('Bearer test'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.findings).toBe(1);
    expect(body.recipients).toBe(2);
    expect(body.sent).toBe(2);
    expect(body).toHaveProperty('executedAt');
    expect(body.findingsCycle).toEqual({ tenants: [{ tenant: 'tenant-a', mode: 'off' }] });
  });

  it('still runs the legacy digest when the findings cycle fails', async () => {
    mockVerifyCronAuth.mockReturnValue({ ok: true });
    mockRunFindingsCycle.mockRejectedValue(new Error('registry down'));
    mockRunDigest.mockResolvedValue({ findings: [], recipients: 0, sent: 0, skipped: 0, failed: 0 });

    const res = await GET(makeRequest('Bearer test'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.findingsCycle).toEqual({ error: 'findings cycle failed' });
    expect(mockRunDigest).toHaveBeenCalled();
  });

  it('returns 500 on service error', async () => {
    mockVerifyCronAuth.mockReturnValue({ ok: true });
    mockRunDigest.mockRejectedValue(new Error('Unexpected'));

    const res = await GET(makeRequest('Bearer test'));
    expect(res.status).toBe(500);
  });
});
