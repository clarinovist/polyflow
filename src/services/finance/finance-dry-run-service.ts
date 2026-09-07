import { BusinessRuleError } from '@/lib/errors/errors';
import { detectMissingFinanceJournals } from '@/lib/telegram/digest/detectors';
import { reconciliationEvidence } from '@/lib/bot/finance-evidence';
import { financeRangeSchema } from './finance-diagnostic-input';
import { reconcileFinance } from './finance-reconciliation-service';
import { previewFinanceRecipients } from './finance-dry-run-recipients';
import { requireFinanceDryRunSnapshot } from './finance-dry-run-tenant';

/** Internal evidence only. No routes, cron, delivery, journal mutation or lifecycle calls. */
export async function runFinanceDryRun(rawInput: unknown) {
    const snapshot = requireFinanceDryRunSnapshot();
    const input = financeRangeSchema.parse(rawInput);
    try {
        const journals = await detectMissingFinanceJournals(snapshot.tx);
        if (journals.status === 'failed') throw new BusinessRuleError('Detector failed');
        const reconciliation = reconciliationEvidence(await reconcileFinance(snapshot.tx, input));
        const recipients = await previewFinanceRecipients(snapshot.tx, snapshot.tenant.tenantId,
            ['/finance/journals', '/finance/reports/income-statement'], snapshot.checkedAt);
        return {
            mode: 'dry-run' as const,
            tenant: snapshot.tenant,
            checkedAt: snapshot.checkedAt.toISOString(),
            completeness: 'partial' as const,
            journals: { ...journals, scope: 'all-time' as const },
            reconciliation,
            recipients,
            rollout: { allowed: false as const, picVerified: false as const, reason: 'Perlu verifikasi tenant/PIC/penerima dan persetujuan aktivasi terpisah.' },
            limitations: [
                'Akun kontrol AR/AP detector adalah kandidat COA tenant; mapping pusat tidak diperiksa. Selisih perlu konfirmasi akuntan.',
                'Detector jurnal all-time, AP mengikuti cutoff existing. Maksimal 500 temuan; cap tampilan bukan batas jumlah dokumen yang dibaca.',
                'Cohort invoice berdasarkan tanggal invoice, P&L berdasarkan tanggal jurnal WIB. DRAFT bukan otomatis laba hilang.',
                'Ini pemeriksaan terbatas, bukan sertifikasi seluruh pembukuan. Tidak ada posting, perbaikan, atau perubahan lifecycle otomatis.',
                'Penerima hanya kandidat; preview bukan reservation dedup dan bukan konfirmasi PIC. Tidak ada pengiriman atau log pengiriman.',
            ],
        };
    } catch {
        throw new BusinessRuleError('Pemeriksaan finance dry-run gagal.');
    }
}
