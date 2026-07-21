import { LoginForm } from '@/components/employee/LoginForm';
import { getEmployeeSession } from '@/lib/auth/employee-session';
import { redirect } from 'next/navigation';

export default async function MyLoginPage() {
  const session = await getEmployeeSession().catch(() => null);
  if (session) redirect('/my');

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-sm p-6 space-y-6">
          <div className="space-y-1">
            <h1 className="text-xl font-black tracking-tight">Masuk Portal Karyawan</h1>
            <p className="text-xs text-muted-foreground">Gunakan No HP yang terdaftar & PIN 4-6 digit. Bisa juga pakai Kode Karyawan.</p>
          </div>
          <LoginForm />
          <div className="text-[10px] text-muted-foreground leading-relaxed border-t pt-4">
            Lupa PIN? Hubungi HRD untuk reset. Data gaji hanya bisa dilihat dengan PIN yang benar.
          </div>
        </div>
      </div>
    </div>
  );
}
