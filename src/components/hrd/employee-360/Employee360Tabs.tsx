'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Employee360Header } from './Employee360Header';
import { Employee360Overview } from './Employee360Overview';
import { Employee360AttendanceTab } from './Employee360AttendanceTab';
import { Employee360ProductionTab } from './Employee360ProductionTab';
import { Employee360PayrollWeeklyTab } from './Employee360PayrollWeeklyTab';
import { Employee360PayrollMonthlyTab } from './Employee360PayrollMonthlyTab';
import { Employee360LoansTab } from './Employee360LoansTab';
import { Employee360LeaveDisciplineTab } from './Employee360LeaveDisciplineTab';
import { Employee360DocumentsTab } from './Employee360DocumentsTab';
import type { Employee } from '@prisma/client';

type Tab = 'overview' | 'attendance' | 'production' | 'payroll-weekly' | 'payroll-monthly' | 'loans' | 'leave-discipline' | 'documents';

interface Props {
  employee: Employee;
  initialTab: string;
}

export function Employee360Tabs({ employee, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>((initialTab as Tab) || 'overview');
  const router = useRouter();

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as Tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  const isPiece = employee.payType === 'PIECE';
  const isMonthly = employee.payType === 'MONTHLY';
  const isDaily = employee.payType === 'DAILY';

  return (
    <div className="space-y-6">
      <Employee360Header employee={employee} />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/30 p-1">
          <TabsTrigger value="overview" className="text-xs">Ringkasan</TabsTrigger>
          <TabsTrigger value="attendance" className="text-xs">Kehadiran</TabsTrigger>
          {isPiece && <TabsTrigger value="production" className="text-xs">Produksi</TabsTrigger>}
          {!isMonthly && <TabsTrigger value="payroll-weekly" className="text-xs">Gaji Mingguan</TabsTrigger>}
          {!isDaily && !isPiece && <TabsTrigger value="payroll-monthly" className="text-xs">Gaji Bulanan</TabsTrigger>}
          <TabsTrigger value="loans" className="text-xs">Kasbon</TabsTrigger>
          <TabsTrigger value="leave-discipline" className="text-xs">Cuti & Disiplin</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Dokumen</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          {activeTab === 'overview' && <Employee360Overview employee={employee} />}
          {activeTab === 'attendance' && <Employee360AttendanceTab employeeId={employee.id} />}
          {activeTab === 'production' && isPiece && <Employee360ProductionTab employeeId={employee.id} />}
          {activeTab === 'payroll-weekly' && !isMonthly && (
            <Employee360PayrollWeeklyTab employeeId={employee.id} />
          )}
          {activeTab === 'payroll-monthly' && !isDaily && !isPiece && (
            <Employee360PayrollMonthlyTab employeeId={employee.id} />
          )}
          {activeTab === 'loans' && <Employee360LoansTab employeeId={employee.id} />}
          {activeTab === 'leave-discipline' && <Employee360LeaveDisciplineTab employeeId={employee.id} />}
          {activeTab === 'documents' && <Employee360DocumentsTab employeeId={employee.id} />}
        </div>
      </Tabs>
    </div>
  );
}
