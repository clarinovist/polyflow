'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reviewLearning } from '@/actions/admin/product-learning';
import { LEARNING_DOMAINS, LEARNING_METRICS, metricKeySchema, type LearningReview } from '@/lib/learning/contracts';
import type { getProductLearningOverview } from '@/services/admin/product-learning.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Overview = Awaited<ReturnType<typeof getProductLearningOverview>>;
const healthLabels: Record<string, string> = {
    DISABLED: 'Nonaktif — menunggu persetujuan aktivasi', POLICY_REQUIRED: 'Konfigurasi kebijakan belum lengkap',
    AWAITING_COMPLETE_DAY: 'Menunggu satu hari penuh setelah aktivasi', STALE: 'Data terlambat / jadwal perlu diperiksa',
    FAILED: 'Ada job gagal — perlu ditinjau', CURRENT: 'Snapshot harian tersedia',
};
const statuses: Record<string, string> = { OPEN: 'Perlu ditinjau', ACCEPTED: 'Diterima untuk investigasi', REJECTED: 'Tidak ditindaklanjuti', MONITORING: 'Mengukur setelah intervensi', EVALUATED: 'Evaluasi tercatat' };
const evaluations: Record<string, string> = {
    INCONCLUSIVE: 'Belum dapat disimpulkan', UNCHANGED: 'Perubahan di bawah 5 poin persentase',
    REGRESSED: 'Rasio teramati memburuk', IMPROVED_OBSERVED_METRIC: 'Rasio teramati membaik — bukan bukti sebab-akibat',
};
const date = (value: Date) => new Date(value).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });

export function LearningCenter({ data }: { data: Overview }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [message, setMessage] = useState('');
    const [module, setModule] = useState('');
    function review(input: LearningReview) {
        setMessage('');
        startTransition(async () => {
            try {
                const result = await reviewLearning(input);
                setMessage(result.success ? 'Tindak lanjut tersimpan.' : result.error ?? 'Perubahan gagal.');
                if (result.success) router.refresh();
            } catch { setMessage('Akses atau koneksi bermasalah. Perubahan belum dikonfirmasi.'); }
        });
    }
    const findings = data.findings.filter(finding => {
        const key = metricKeySchema.safeParse(finding.metricKey);
        return key.success && (!module || LEARNING_METRICS[key.data].module === module);
    });
    return <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2"><h1 className="text-2xl font-semibold tracking-tight">Learning Center</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">Pengamatan harian → investigasi → regression test → rilis terverifikasi → ukur ulang.</p></div>
            <Button variant="outline" onClick={() => router.refresh()}>Muat ulang</Button>
        </header>
        <Card><CardHeader><CardTitle className="text-base">{healthLabels[data.health] ?? data.health}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed">
                <p>Scope: reliabilitas produk, agregat global terbatas untuk superadmin. Tidak ada profil individu, isi percakapan, data bisnis tenant, atau pengiriman AI eksternal.</p>
                <p className="text-muted-foreground">Agregat bukan jaminan anonimitas. Telemetry bersifat best-effort; event bukan pengguna atau tugas unik. Snapshot bukan bukti adopsi, kepuasan, atau dampak bisnis.</p>
                {data.configuration.enabled ? <p>Kebijakan: {data.configuration.version}. Prospektif sejak {date(data.configuration.activeFrom)}. Retensi snapshot {data.configuration.retentionDays} hari; tindak lanjut {data.configuration.closedRetentionDays} hari setelah ditutup.</p> : <p>Aktivasi dilakukan melalui konfigurasi operasional setelah scope dan retensi disetujui. Tidak ada agregasi sumber saat nonaktif.</p>}
            </CardContent></Card>
        <section className="space-y-3" aria-labelledby="backlog-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="backlog-heading" className="text-lg font-semibold">Antrean perbaikan produk</h2>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">Area <select aria-label="Filter area" className="min-h-11 rounded-md border bg-background px-3" value={module} onChange={event => setModule(event.target.value)}>
                        <option value="">Semua</option><option value="assistant">Asisten</option><option value="mobile">Mobile</option><option value="analytics">Instrumentasi</option>
                    </select></label>
                    <a className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm underline underline-offset-4" href={`/api/admin/learning/export${module ? `?module=${module}` : ''}`}>Unduh brief pengembangan</a>
                </div>
            </div>
            <p role="status" aria-live="polite" className="text-sm">{pending ? 'Menyimpan…' : message}</p>
            {!findings.length && <Card><CardContent className="py-8 text-sm text-muted-foreground">Belum ada temuan pada area ini. Ini bukan bukti tidak ada masalah: periksa aktivasi, kelengkapan snapshot, dan jumlah event di bawah.</CardContent></Card>}
            {findings.map(finding => {
                const rule = LEARNING_METRICS[metricKeySchema.parse(finding.metricKey)];
                return <Card key={finding.id}><CardHeader className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{rule.label}</CardTitle><Badge variant="outline">{statuses[finding.status] ?? finding.status}</Badge></div>
                    <p className="break-all text-xs text-muted-foreground">{finding.id}</p>
                </CardHeader><CardContent className="space-y-4 text-sm leading-relaxed">
                    <p>{finding.latestNumerator} / {finding.latestDenominator} event pada {date(finding.lastSeenDay)}. Terdeteksi pada {finding.occurrences} hari.</p>
                    <p className="text-muted-foreground">Pembagi: {rule.denominator}. Pemicu investigasi: ≥{rule.minimum} event dan rasio ≥{rule.threshold * 100}%. Bukan diagnosis.</p>
                    <p>{rule.action}</p>
                    {finding.status === 'OPEN' && <div className="flex flex-wrap gap-2">
                        <Button disabled={pending || !data.configuration.enabled} onClick={() => review({ id: finding.id, action: 'accept' })}>Terima untuk investigasi</Button>
                        <Button variant="outline" disabled={pending || !data.configuration.enabled} onClick={() => review({ id: finding.id, action: 'reject' })}>Tidak ditindaklanjuti</Button>
                    </div>}
                    {finding.status === 'ACCEPTED' && <form className="space-y-4 border-t pt-4" onSubmit={event => {
                        event.preventDefault(); const form = new FormData(event.currentTarget);
                        review({ id: finding.id, action: 'intervention', releaseRef: String(form.get('releaseRef')), verificationRef: String(form.get('verificationRef')) });
                    }}>
                        <p>Catat setelah perubahan benar-benar dirilis. Referensi adalah deklarasi reviewer, bukan pemeriksaan CI otomatis.</p>
                        <label className="block space-y-1"><span>Commit SHA rilis (40 karakter)</span><Input className="min-h-11 font-mono" name="releaseRef" required pattern="[a-f0-9]{40}" maxLength={40} /></label>
                        <label className="block space-y-1"><span>Path regression test (src/…/*.test.ts atau *.spec.ts)</span><Input className="min-h-11" name="verificationRef" required maxLength={240} placeholder="src/lib/bot/__tests__/routing.test.ts" /></label>
                        <Button className="h-auto min-h-11 whitespace-normal text-left" disabled={pending || !data.configuration.enabled}>Catat intervensi dan mulai pengukuran</Button>
                    </form>}
                    {finding.evaluationStart && finding.evaluationEnd && <p>Perbandingan 7 hari sebelum pencatatan dengan {date(finding.evaluationStart)}–{date(new Date(new Date(finding.evaluationEnd).getTime() - 1))}. Baseline: {finding.baselineNumerator}/{finding.baselineDenominator} event; {finding.baselineComplete ? '7 hari tersedia' : 'tidak lengkap'}.</p>}
                    {finding.evaluationResult && <p className="font-medium">{evaluations[finding.evaluationResult] ?? finding.evaluationResult}. Setelah: {finding.evaluationNumerator}/{finding.evaluationDenominator} event.</p>}
                    {finding.releaseRef && <p className="break-all text-xs text-muted-foreground">Rilis {finding.releaseRef} · {finding.verificationRef}</p>}
                </CardContent></Card>;
            })}
        </section>
        <section aria-labelledby="snapshot-heading" className="space-y-3"><h2 id="snapshot-heading" className="text-lg font-semibold">Snapshot harian · 30 hari terakhir</h2>
            {!data.runs.length ? <p className="text-sm text-muted-foreground">Belum ada snapshot tersimpan. Job tidak menciptakan angka contoh.</p> : <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full text-left text-sm"><caption className="sr-only">Status job dan pengamatan harian dalam waktu Jakarta</caption><thead><tr className="border-b"><th className="p-3">Hari</th><th className="p-3">Job</th><th className="p-3">Pengamatan</th></tr></thead><tbody>{data.runs.map(run => <tr key={run.id} className="border-b last:border-0"><td className="whitespace-nowrap p-3 align-top">{date(run.day)}</td><td className="p-3 align-top">{run.status}<br /><span className="text-xs text-muted-foreground">{run.attempts} percobaan{run.failureCode ? ` · ${run.failureCode}` : ''}</span></td><td className="p-3"><ul className="space-y-2">{run.observations.map(observation => {
                const key = metricKeySchema.safeParse(observation.metricKey);
                return key.success && <li key={observation.id}>{LEARNING_METRICS[key.data].label}: {observation.numerator}/{observation.denominator} <span className="text-muted-foreground">({observation.state === 'NO_DATA' ? 'tidak ada data' : observation.state === 'INSUFFICIENT' ? 'sampel belum cukup' : 'teramati'})</span></li>;
            })}</ul></td></tr>)}</tbody></table></div>}
            <p className="text-xs text-muted-foreground">Evaluasi memerlukan dua jendela 7 hari lengkap dan ≥50 event per jendela. Perubahan ≥5 poin persentase hanya tren deskriptif, bukan signifikansi statistik atau bukti sebab-akibat.</p>
        </section>
        <section className="space-y-3" aria-labelledby="domain-heading"><h2 id="domain-heading" className="text-lg font-semibold">Arah perluasan</h2><div className="flex flex-wrap gap-2">{LEARNING_DOMAINS.map(domain => <Badge key={domain.key} variant="outline">{domain.label} · {domain.supported ? 'pilot tersedia' : 'belum diaktifkan'}</Badge>)}</div><p className="text-sm text-muted-foreground">Domain baru memerlukan tujuan, sumber, izin, kualitas data, dan evaluasi tersendiri. Entri di sini bukan kemampuan prediksi.</p></section>
    </div>;
}
