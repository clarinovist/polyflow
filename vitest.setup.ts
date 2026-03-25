import { vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({ data, init })),
    redirect: vi.fn(),
    next: vi.fn()
  },
  NextRequest: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
