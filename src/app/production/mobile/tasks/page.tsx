import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import {
    getMobileSupervisorSpkList,
    type MobileSupervisorSpkItem,
} from '@/actions/production/mobile-supervisor';
import { MobileDataFreshness, MobileSectionHeader } from '@/components/mobile';

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
    RELEASED:
        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    IN_PROGRESS:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    DRAFT: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    WAITING_MATERIAL:
        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const PRIORITY_COLOR: Record<string, string> = {
    URGENT: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    NORMAL: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    LOW: 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

function TaskContent({ order }: { order: MobileSupervisorSpkItem }) {
    return (
        <>
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
                    <div className="mt-1 truncate text-xs text-slate-700 dark:text-slate-300">
                        {order.productName}
                        {order.productCode ? ` • ${order.productCode}` : ''}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {order.machineName
                            ? `Mesin: ${order.machineName}`
                            : 'Mesin: -'}{' '}
                        • {order.locationName || 'Lokasi: -'}
                    </div>
                </div>
                <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[order.status] || 'bg-slate-100 text-slate-600'}`}
                >
                    {STATUS_LABEL[order.status] || order.status}
                </span>
            </div>
            <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                        {order.actualQty} / {order.plannedQty}
                    </span>
                    <span>{order.progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                        className="h-full bg-indigo-600 transition-all"
                        style={{ width: `${order.progressPercent}%` }}
                    />
                </div>
            </div>
            <div className="mt-2 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                {order.href
                    ? 'Buka eksekusi di Kiosk →'
                    : 'Informasi saja · tujuan Kiosk tidak diizinkan'}
            </div>
        </>
    );
}

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
    if (!response.success) {
        return <MobileReadError title="Daftar SPK belum tersedia" />;
    }
    const { generatedAt, total, returned, limit, createHref, items } =
        response.data;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <MobileSectionHeader title="Tugas & Status SPK" level={1} />
                {createHref && (
                    <Link
                        href={createHref}
                        className="inline-flex min-h-11 items-center gap-1 rounded-full bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        Buat SPK
                    </Link>
                )}
            </div>
            <MobileDataFreshness generatedAt={generatedAt} />
            <p className="text-xs text-slate-500">
                Menampilkan {returned} dari {total} SPK · batas cuplikan {limit}
            </p>

            <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                    { value: 'ALL', label: 'Semua' },
                    { value: 'IN_PROGRESS', label: 'Berjalan' },
                    { value: 'RELEASED', label: 'Dirilis' },
                    { value: 'DRAFT', label: 'Draft' },
                ].map((option) => {
                    const active = (sp.status || 'ALL') === option.value;
                    return (
                        <Link
                            key={option.value}
                            href={`/production/mobile/tasks?status=${option.value}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}`}
                            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-2 text-xs font-medium ${
                                active
                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                        >
                            {option.label}
                        </Link>
                    );
                })}
            </div>

            {!items.length ? (
                <p className="py-4 text-sm text-slate-500">
                    Tidak ada SPK untuk filter ini.
                </p>
            ) : (
                <div className="space-y-3">
                    {items.map((order) => {
                        const className =
                            'block min-h-11 rounded-lg border bg-white p-3 transition-colors dark:border-slate-700 dark:bg-slate-800';
                        return order.href ? (
                            <Link
                                key={order.id}
                                href={order.href}
                                className={`${className} hover:border-indigo-200 dark:hover:border-indigo-800`}
                            >
                                <TaskContent order={order} />
                            </Link>
                        ) : (
                            <article key={order.id} className={className}>
                                <TaskContent order={order} />
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
