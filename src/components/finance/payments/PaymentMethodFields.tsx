'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHODS,
  type PaymentBankKey,
  type PaymentMethod,
  type TenantPaymentBanks,
  getClearingBankLabel,
  getPaymentMethodLabel,
} from '@/lib/finance/payment-methods';

export interface PaymentMethodFieldsProps {
  method: string;
  onMethodChange: (method: PaymentMethod) => void;
  referenceNumber: string;
  onReferenceNumberChange: (value: string) => void;
  destinationBank: PaymentBankKey | '';
  onDestinationBankChange: (value: PaymentBankKey | '') => void;
  paymentBanks?: TenantPaymentBanks;
  methodId?: string;
}

export function PaymentMethodFields({
  method,
  onMethodChange,
  referenceNumber,
  onReferenceNumberChange,
  destinationBank,
  onDestinationBankChange,
  paymentBanks = {},
  methodId = 'method',
}: PaymentMethodFieldsProps) {
  const isCheck = method === 'Check';

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={methodId}>Metode Pembayaran</Label>
        <Select
          value={method}
          onValueChange={(value) => {
            onMethodChange(value as PaymentMethod);
            if (value !== 'Check') {
              onReferenceNumberChange('');
              onDestinationBankChange('');
            }
          }}
          required
        >
          <SelectTrigger id={methodId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {getPaymentMethodLabel(m, paymentBanks)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isCheck && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${methodId}-check-number`}>Nomor Cek / Giro</Label>
            <Input
              id={`${methodId}-check-number`}
              value={referenceNumber}
              onChange={(e) => onReferenceNumberChange(e.target.value)}
              placeholder="Contoh: CG-001234"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${methodId}-clearing-bank`}>
              Bank Tujuan Clearing
            </Label>
            <Select
              value={destinationBank || undefined}
              onValueChange={(value) =>
                onDestinationBankChange(value as PaymentBankKey)
              }
              required
            >
              <SelectTrigger id={`${methodId}-clearing-bank`}>
                <SelectValue placeholder="Pilih BCA atau Mandiri" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BCA">
                  {getClearingBankLabel('BCA', paymentBanks)}
                </SelectItem>
                <SelectItem value="MANDIRI">
                  {getClearingBankLabel('MANDIRI', paymentBanks)}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Alokasi rekening perusahaan tempat cek/giro di-clearing.
            </p>
          </div>
        </>
      )}
    </>
  );
}

export { DEFAULT_PAYMENT_METHOD };
