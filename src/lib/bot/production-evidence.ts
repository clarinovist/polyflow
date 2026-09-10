import { createEvidence } from './evidence';
import type {
    ProductionBriefing,
    ProductionOrderDiagnosis,
} from '@/services/production/assistant-production-query-service';
import { toBusinessDateString } from '@/lib/utils/timezone';

function quantity(value: number): string {
    return new Intl.NumberFormat('id-ID', {
        maximumFractionDigits: 4,
    }).format(value);
}

function date(value: Date | null): string {
    return value ? `${toBusinessDateString(value)} WIB` : 'Belum ditentukan';
}

export function productionDiagnosisEvidence(result: ProductionOrderDiagnosis) {
    if (result.kind !== 'selected' || !result.order) {
        return createEvidence({
            summary:
                result.kind === 'missing'
                    ? 'SPK tidak ditemukan.'
                    : `Ditemukan ${result.candidates.length} SPK. Pilih nomor/ID SPK persis; diagnosis belum dijalankan.`,
            facts: result.candidates.map((candidate) => ({
                label: candidate.orderNumber,
                value: `${candidate.status} — ${candidate.product}`,
            })),
            entities: result.candidates.map((candidate) => ({
                type: 'ProductionOrder',
                id: candidate.id,
                label: candidate.orderNumber,
                href: `/production/orders/${encodeURIComponent(candidate.id)}`,
            })),
            source: 'tenant-data',
            completeness: 'partial',
        });
    }

    const order = result.order;
    const shortageCount = order.materials.filter(
        (material) => material.shortage > 0,
    ).length;
    return createEvidence({
        summary: `Diagnosis SPK ${order.orderNumber}: ${shortageCount} material terindikasi kurang dan ${order.openIssues.length} issue terbuka.`,
        facts: [
            {
                label: 'Status dan produk',
                value: `${order.status} — ${order.product}`,
            },
            {
                label: 'Target vs aktual',
                value: `${quantity(order.plannedQuantity)} vs ${quantity(order.actualQuantity)}`,
            },
            {
                label: 'Rencana selesai',
                value: date(order.plannedEndDate),
            },
            {
                label: 'Mesin',
                value: order.machine ?? 'Belum diassign',
            },
            {
                label: 'Mode material',
                value: order.materialConsumptionMode,
            },
            ...(order.materialCheckReason
                ? [
                      {
                          label: 'Batas pemeriksaan material',
                          value: order.materialCheckReason,
                      },
                  ]
                : []),
            ...order.materials.map((material) => ({
                label: `Material ${material.material}`,
                value: `Rencana ${quantity(material.required)}; tercatat issue/stage ${quantity(material.issued)}; sisa ${quantity(material.remaining)}; stok eligible${material.sourceLocation ? ` di ${material.sourceLocation}` : ''} ${quantity(material.available)}; ${material.shortage > 0 ? `indikasi kurang ${quantity(material.shortage)}` : 'tidak terindikasi kurang'}`,
            })),
            ...order.openIssues.map((issue) => ({
                label: `Issue ${issue.category}`,
                value: issue.description,
            })),
            {
                label: 'Cakupan',
                value: 'Read-only. Kecukupan material memakai rencana material tersimpan, issue/stage non-VOIDED, stok lokasi eligible dikurangi reservasi aktif pihak lain dan material STAGED yang sudah dihitung terpenuhi. Kapasitas serta availability mesin tidak diperiksa.',
            },
        ],
        entities: [
            {
                type: 'ProductionOrder',
                id: order.id,
                label: order.orderNumber,
                href: `/production/orders/${encodeURIComponent(order.id)}`,
            },
        ],
        source: 'tenant-data',
        completeness: order.materialCheck,
    });
}

export function productionBriefingEvidence(result: ProductionBriefing) {
    const today = toBusinessDateString(new Date());
    return createEvidence({
        summary: `Briefing produksi ${today} WIB: ${result.total} SPK aktif/perlu ditinjau; menampilkan ${result.items.length}.`,
        facts: [
            {
                label: 'Urutan review',
                value: 'plannedEndDate paling awal, tanggal kosong terakhir; lalu priority dan nomor SPK. Ini bukan hasil optimasi jadwal.',
            },
            ...result.items.map((order) => ({
                label: order.orderNumber,
                value: `${order.status}; ${order.product}; target ${quantity(order.plannedQuantity)}, aktual ${quantity(order.actualQuantity)}; rencana selesai ${date(order.plannedEndDate)}; mesin ${order.machine ?? 'belum diassign'}; issue terbuka ${order.openIssueCount}`,
            })),
            ...(result.truncated
                ? [
                      {
                          label: 'Batas hasil',
                          value: `Daftar dipotong pada ${result.items.length} dari ${result.total} SPK.`,
                      },
                  ]
                : []),
            {
                label: 'Batas interpretasi',
                value: 'plannedEndDate bukan komitmen kirim customer. Briefing ini tidak memeriksa kapasitas mesin atau kecukupan material tiap SPK; gunakan diagnosis SPK untuk pendalaman.',
            },
        ],
        entities: result.items.map((order) => ({
            type: 'ProductionOrder',
            id: order.id,
            label: order.orderNumber,
            href: `/production/orders/${encodeURIComponent(order.id)}`,
        })),
        source: 'tenant-data',
        completeness: result.truncated ? 'partial' : 'complete',
    });
}
