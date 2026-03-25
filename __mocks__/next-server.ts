/* eslint-disable @typescript-eslint/no-explicit-any */
export const NextResponse = {
  json: (...args: any[]) => args,
  redirect: (...args: any[]) => args,
  next: (...args: any[]) => args,
};
export const NextRequest = class {};
