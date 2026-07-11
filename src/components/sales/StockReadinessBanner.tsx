'use client';

import { AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils/utils';

export interface StockReadinessLine {
  productVariantId: string;
  productName: string;
  neededQty: number;
  availableQty: number;
  reservedForThisSo: number;
  shortfall: number;
  isReady: boolean;
}

interface StockReadinessBannerProps {
  lines: StockReadinessLine[];
  className?: string;
  /** Compact mode: single summary line instead of per-line detail */
  compact?: boolean;
}

/**
 * Shows stock readiness status for a Delivery Order.
 * - Yellow/amber warning when stock is insufficient (soft warning at create/LOADING)
 * - Green confirmation when all lines are ready
 *
 * Usage:
 *   <StockReadinessBanner lines={readinessLines} />
 *   <StockReadinessBanner lines={readinessLines} compact />
 */
export function StockReadinessBanner({ lines, className, compact = false }: StockReadinessBannerProps) {
  if (!lines || lines.length === 0) return null;

  const allReady = lines.every(l => l.isReady);
  const totalShortfall = lines.reduce((sum, l) => sum + l.shortfall, 0);
  const notReadyLines = lines.filter(l => !l.isReady);

  if (allReady) {
    return (
      <Alert className={cn('border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950', className)}>
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertTitle className="text-green-800 dark:text-green-200">
          Stok FG Siap
        </AlertTitle>
        <AlertDescription className="text-green-700 dark:text-green-300">
          {compact
            ? `${lines.length} item siap dikirim.`
            : `Semua ${lines.length} item memiliki stok cukup di gudang.`}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className={cn('border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950', className)}>
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-800 dark:text-amber-200">
        Stok FG Belum Lengkap
      </AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-300">
        {compact ? (
          <span>
            {notReadyLines.length} dari {lines.length} item kekurangan stok
            (total kurang: {totalShortfall.toLocaleString('id-ID')}).
            {' '}Surat Jalan bisa dicetak, tapi <strong>Tandai Dikirim</strong> akan gagal sampai stok cukup.
          </span>
        ) : (
          <div className="mt-2 space-y-1">
            {notReadyLines.map(line => (
              <div key={line.productVariantId} className="flex items-center gap-2 text-xs">
                <Package className="h-3 w-3 flex-shrink-0" />
                <span className="font-medium">{line.productName}</span>
                <span className="text-muted-foreground">
                  perlu {line.neededQty.toLocaleString('id-ID')}, tersedia {line.availableQty.toLocaleString('id-ID')}
                  {line.reservedForThisSo > 0 && ` (${line.reservedForThisSo.toLocaleString('id-ID')} reserved)`}
                  {' '}— kurang <strong>{line.shortfall.toLocaleString('id-ID')}</strong>
                </span>
              </div>
            ))}
            <p className="mt-2 text-xs">
              Surat Jalan bisa dicetak, tapi <strong>Tandai Dikirim</strong> akan gagal sampai stok cukup.
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
