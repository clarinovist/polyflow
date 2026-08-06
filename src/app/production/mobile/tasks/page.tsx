import React from 'react';
import Link from 'next/link';
import { getMobileSupervisorSpkList } from '@/actions/production/mobile-supervisor';
import { MobileSectionHeader } from '@/components/mobile';
import { Plus } from 'lucide-react';

type SearchParams = {
    status?: string;
    q?: string;
};

const STATUS_LABEL: Record<string, string> = {
    RELEASED: 'Dirilis',
    IN_PROGRESS: 'Berjalan',
    DRAFT: 'Draft',
    WAITING_MATERIAL: 'Tunggu Material',
};

const STATUS_COLOR: Record<string, string> = {
    RELEASED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    IN_PROGRESS: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    DRAFT: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    WAITING_MATERIAL: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const PRIORITY_COLOR: Record<string, string> = {
    URGENT: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    NORMAL: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    LOW: 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export default async function ProductionTasksPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const sp = await searchParams;
    const response = await getMobileSupervisorSpkList({
        status: sp.status || 'ALL',
        q: sp.q?.trim() || undefined,
    });
    const data = response.success ? response.data : null;
    const items = data?.items ?? [];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <MobileSectionHeader title="Tugas & Status SPK" />
                <Link
                    href="/production/mobile/tasks/new"
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                    <Plus className="h-4 w-4" />
                    Buat SPK
                </Link>
            </div>

            {/* Quick filters */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                    { value: 'ALL', label: 'Semua' },
                    { value: 'IN_PROGRESS', label: 'Berjalan' },
                    { value: 'RELEASED', label: 'Dirilis' },
                    { value: 'DRAFT', label: 'Draft' },
                ].map((opt) => {
                    const active = (sp.status || 'ALL') === opt.value;
                    return (
                        <Link
                            key={opt.value}
                            href={`/production/mobile/tasks?status=${opt.value}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}`}
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border ${
                                active
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                            }`}
                        >
                            {opt.label}
                        </Link>
                    );
                })}
            </div>

            {!items.length ? (
                <p className="text-sm text-slate-500 py-4">Tidak ada SPK untuk filter ini.</p>
            ) : (
                <div className="space-y-3">
                    {items.map((order) => (
                        <Link
                            key={order.id}
                            href={`/kiosk/jobs/${order.id}`}
                            className="block rounded-lg border bg-white p-3 hover:border-indigo-200 transition-colors dark:bg-slate-800 dark:border-slate-700 dark:hover:border-indigo-800"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                            {order.spkNumber}
                                        </span>
                                        <span
                                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_COLOR[order.priority] || PRIORITY_COLOR.NORMAL}`}
                                        >
                                            {order.priority}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-xs text-slate-700 dark:text-slate-300 truncate">
                                        {order.productName}
                                        {order.productCode ? ` • ${order.productCode}` : ''}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                        {order.machineName ? `Mesin: ${order.machineName}` : 'Mesin: -'} • {order.locationName || 'Lokasi: -'}
                                    </div>
                                </div>
                                <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[order.status] || 'bg-slate-100 text-slate-600'}`}
                                >
                                    {STATUS_LABEL[order.status] || order.status}
                                </span>
                            </div>
                            <div className="mt-3">
                                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                                    <span>
                                        {order.actualQty} / {order.plannedQty}
                                    </span>
                                    <span>{order.progressPercent}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-600 transition-all"
                                        style={{ width: `${order.progressPercent}%` }}
                                    />
                                </div>
                            </div>
                            <div className="mt-2 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                                Tap untuk eksekusi di Kiosk →
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
