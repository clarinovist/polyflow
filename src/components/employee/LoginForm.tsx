'use client';

import { useState } from 'react';
import { loginEmployee } from '@/actions/employee/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Phone, Lock } from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !pin.trim()) {
      toast.error('Isi No HP dan PIN');
      return;
    }
    setLoading(true);
    try {
      const res = await loginEmployee(phone.trim(), pin.trim());
      if (res.success) {
        toast.success(`Halo ${res.data?.name ?? ''}!`);
        router.push('/my');
        router.refresh();
      } else {
        toast.error(('error' in res ? res.error : null) || 'Gagal login');
      }
    } catch {
      toast.error('Gagal login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="phone" className="text-xs">No HP / Kode Karyawan</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="phone"
            inputMode="numeric"
            placeholder="08xxxxxxxxxx atau EMP-001"
            className="pl-9 h-11"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pin" className="text-xs">PIN</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            placeholder="4-6 digit"
            className="pl-9 h-11 tracking-widest"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={6}
          />
        </div>
      </div>
      <Button type="submit" className="w-full h-11 font-bold" disabled={loading}>
        {loading ? 'Memeriksa...' : 'Masuk'}
      </Button>
      <div className="text-[11px] text-muted-foreground text-center">
        Format HP bebas: 08…, 628…, +62…
      </div>
    </form>
  );
}
