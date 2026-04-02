import { NextRequest } from 'next/server';

export const POLYFLOW_PRODUCT_ID = 'polyflow';

export function resolveRequestedProduct(req: NextRequest): string {
  const headerProduct = req.headers.get('x-openclaw-product');
  const bodyProduct = req.nextUrl.searchParams.get('product');
  return (headerProduct || bodyProduct || '').trim().toLowerCase();
}

export function isPolyflowScoped(req: NextRequest): boolean {
  const requested = resolveRequestedProduct(req);
  return requested === POLYFLOW_PRODUCT_ID;
}
