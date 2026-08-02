'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string; icon: string; domains?: string[] };

export function BottomNav({ allowedDomains }: { allowedDomains?: string[] }) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: '/telegram/home', label: 'Home', icon: '🏠' },
    { href: '/telegram/data', label: 'Data', icon: '📦', domains: ['stock', 'sales', 'production', 'finance', 'purchasing'] },
    { href: '/telegram/account', label: 'Akun', icon: '👤' },
  ];

  const filtered = items.filter((it) => {
    if (!it.domains) return true;
    if (!allowedDomains || allowedDomains.length === 0) return true;
    return it.domains.some((d) => allowedDomains.includes(d));
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/10 bg-[var(--tg-theme-bg-color,#fff)] dark:border-white/10 tg-safe-bottom">
      <div className="mx-auto flex max-w-[480px] items-stretch justify-around">
        {filtered.map((it) => {
          const active = pathname === it.href || (it.href !== '/telegram/home' && pathname.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs ${active ? 'font-semibold' : 'opacity-60'}`}
              style={{ minHeight: 56 }}
            >
              <span className="text-[20px] leading-none">{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
