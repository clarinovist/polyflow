'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { scanEmploymentReminders } from '@/actions/hrd/employment-reminder';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function ScanRemindersButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleScan = async () => {
    setLoading(true);
    try {
      const res = await scanEmploymentReminders();
      if (res.success) {
        const data = res.data;
        toast.success(`Scan selesai: ${data.scanned} karyawan, ${data.created} notifikasi baru`);
        router.refresh();
      } else {
        toast.error(res.error || 'Gagal scan');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleScan} disabled={loading}>
      <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Memindai…' : 'Jalankan scan'}
    </Button>
  );
}
