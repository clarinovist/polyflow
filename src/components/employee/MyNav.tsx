'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Wallet, Factory, Calendar, LogOut } from 'lucide-react';
import { logoutEmployee } from '@/actions/employee/auth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/utils';

const ITEMS = [
  { href: '/my', label: 'Beranda', icon: Home, exact: true },
  { href: '/my/gaji', label: 'Gaji Saya', icon: Wallet },
  { href: '/my/produksi', label: 'Hasil Produksi', icon: Factory },
  { href: '/my/absensi', label: 'Absensi & Izin', icon: Calendar },
];

export function MyNav() {
  const pathname = usePathname();
  const router = useRouter();

  const onLogout = async () => {
    await logoutEmployee();
    toast.success('Keluar');
    router.push('/my/login');
    router.refresh();
  };

  return (
    <nav className="p-2 lg:p-3 flex lg:flex-col gap-1 overflow-x-auto">
      <div className="flex lg:flex-col gap-1 w-full">
        {ITEMS.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              <it.icon className="h-4 w-4 shrink-0" />
              {it.label}
            </Link>
          );
        })}
      </div>
      <div className="hidden lg:block flex-1" />
      <button
        onClick={onLogout}
        className="ml-auto lg:ml-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 whitespace-nowrap"
      >
        <LogOut className="h-4 w-4" /> Keluar
      </button>
    </nav>
  );
}
