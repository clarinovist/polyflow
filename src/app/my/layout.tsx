import { getCompanyConfigAsync } from '@/lib/config/company';
import { MyNav } from '@/components/employee/MyNav';
import { getEmployeeSession } from '@/lib/auth/employee-session';
import { headers } from 'next/headers';
import { extractSubdomain } from '@/lib/core/subdomain';
import type { CompanyConfig } from '@/lib/config/company';

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const company: CompanyConfig = await getCompanyConfigAsync().catch(
    () => ({ name: 'PolyFlow', logoUrl: null }) as CompanyConfig,
  );
  const session = await getEmployeeSession().catch(() => null);

  // Tenant name for branding
  let tenantLabel = company?.name || 'PolyFlow';
  try {
    const h = await headers();
    const host = h.get('host') || '';
    const forwarded = h.get('x-forwarded-host') || '';
    const sub = extractSubdomain(forwarded || host);
    if (sub) tenantLabel = sub.toUpperCase();
  } catch { /* ignore */ }

  return (
    <div className="min-h-screen bg-[#f6f7fb] dark:bg-zinc-950 flex flex-col">
      <header className="h-14 border-b bg-white dark:bg-zinc-900 px-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black text-sm">M</div>
          <div className="leading-tight">
            <div className="font-bold text-sm tracking-tight">MY • {tenantLabel}</div>
            <div className="text-[10px] text-muted-foreground -mt-0.5">{company?.name ?? 'Employee Portal'}</div>
          </div>
        </div>
        {session && (
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold">{session.name}</div>
              <div className="text-[10px] text-muted-foreground">{session.code}</div>
            </div>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
              {session.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto flex flex-col lg:flex-row">
        {session && (
          <aside className="lg:w-60 lg:shrink-0 lg:border-r bg-white dark:bg-zinc-900 lg:min-h-[calc(100vh-56px)]">
            <MyNav />
          </aside>
        )}
        <main className="flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
