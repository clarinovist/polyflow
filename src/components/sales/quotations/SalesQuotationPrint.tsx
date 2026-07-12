"use client";

import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { getCompanyConfig, type CompanyConfig } from "@/lib/config/company";
import { formatRupiah } from "@/lib/utils/utils";
import { getEnteredQuantityDisplay, getEnteredUnitPriceDisplay } from '@/lib/utils/production-units';

type QuotationItem = {
  id: string;
  quantity: unknown;
  enteredQuantity?: unknown;
  enteredUnit?: string | null;
  unitPrice: unknown;
  enteredUnitPrice?: unknown;
  discountPercent?: unknown;
  taxPercent?: unknown;
  subtotal: unknown;
  productVariant?: {
    name: string;
    primaryUnit: string;
    salesUnit?: string | null;
    product?: { name: string } | null;
  } | null;
};

export interface QuotationPrintData {
  quotationNumber: string;
  quotationDate: Date | string;
  validUntil?: Date | string | null;
  notes?: string | null;
  totalAmount?: unknown;
  discountAmount?: unknown;
  taxAmount?: unknown;
  customer?: {
    name: string;
    phone?: string | null;
    email?: string | null;
    billingAddress?: string | null;
    shippingAddress?: string | null;
  } | null;
  items?: QuotationItem[];
}

interface SalesQuotationPrintProps {
  quotation: QuotationPrintData;
  companyConfig?: CompanyConfig;
}

export function SalesQuotationPrint({
  quotation,
  companyConfig,
}: SalesQuotationPrintProps) {
  const COMPANY: CompanyConfig = companyConfig || getCompanyConfig();
  const customer = quotation.customer;
  const items = quotation.items ?? [];



  return (
    <div className="p-8 text-black bg-white font-mono">
      {/* Styles for printing */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Header Info */}
      <div className="flex justify-between items-start border-b-2 pb-6 mb-6">
        <div>
          <h1 className="text-xl font-bold uppercase">{COMPANY.name}</h1>
          <p className="text-xs whitespace-pre-line leading-relaxed mt-1">{COMPANY.address}</p>
          <p className="text-xs mt-1">Telp: {COMPANY.phone} | Email: {COMPANY.email}</p>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold uppercase tracking-wider text-gray-700">PENAWARAN PENJUALAN</h2>
          <p className="text-sm font-semibold mt-1">No: {quotation.quotationNumber}</p>
          <p className="text-xs text-gray-500 mt-1">
            Tanggal: {format(new Date(quotation.quotationDate), "dd MMMM yyyy", { locale: idLocale })}
          </p>
          {quotation.validUntil && (
            <p className="text-xs text-red-600 font-semibold mt-1">
              Berlaku S/D: {format(new Date(quotation.validUntil), "dd MMMM yyyy", { locale: idLocale })}
            </p>
          )}
        </div>
      </div>

      {/* Customer Info */}
      <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
        <div className="border p-4 rounded-lg bg-gray-50/50">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Kepada Yth:</p>
          <p className="font-bold text-base text-gray-900">{customer?.name || "Prospect Customer"}</p>
          <p className="text-xs text-gray-600 mt-1">{customer?.billingAddress || customer?.shippingAddress || "-"}</p>
          {customer?.phone && <p className="text-xs text-gray-600 mt-1">Telp: {customer.phone}</p>}
        </div>
        <div className="border p-4 rounded-lg bg-gray-50/50 flex flex-col justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Keterangan / Catatan:</p>
            <p className="text-xs text-gray-700">{quotation.notes || "Tidak ada catatan."}</p>
          </div>
          <div className="text-xs text-gray-500 text-right mt-2">
            Syarat Pembayaran: Mengikuti kesepakatan order
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr className="border-y-2 border-black bg-gray-100 font-semibold">
            <th className="py-2 text-left px-2">Nama Produk / Varian</th>
            <th className="py-2 text-right px-2 w-[120px]">Qty</th>
            <th className="py-2 text-right px-2 w-[160px]">Harga Satuan</th>
            <th className="py-2 text-right px-2 w-[100px]">Diskon</th>
            <th className="py-2 text-right px-2 w-[100px]">Pajak</th>
            <th className="py-2 text-right px-2 w-[180px]">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const qtyDisp = getEnteredQuantityDisplay({ ...item, ...item.productVariant });
            const priceDisp = getEnteredUnitPriceDisplay({ ...item, ...item.productVariant });
            return (
              <tr key={item.id || index} className="border-b border-gray-200 hover:bg-gray-50/30">
                <td className="py-2.5 px-2">
                  <div className="font-semibold text-gray-800">
                    {item.productVariant?.product?.name || item.productVariant?.name || "Produk"}
                  </div>
                  {item.productVariant?.name && (
                    <div className="text-xs text-gray-500">{item.productVariant.name}</div>
                  )}
                </td>
                <td className="py-2.5 text-right px-2 font-mono">{qtyDisp}</td>
                <td className="py-2.5 text-right px-2 font-mono">
                  {formatRupiah(priceDisp.price)}/{priceDisp.unit}
                </td>
                <td className="py-2.5 text-right px-2 text-red-600 font-mono">
                  {Number(item.discountPercent) > 0 ? `${Number(item.discountPercent)}%` : "-"}
                </td>
                <td className="py-2.5 text-right px-2 font-mono">
                  {Number(item.taxPercent) > 0 ? `${Number(item.taxPercent)}%` : "-"}
                </td>
                <td className="py-2.5 text-right px-2 font-semibold font-mono">
                  {formatRupiah(Number(item.subtotal))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Summary Section */}
      <div className="flex justify-between items-start text-sm">
        <div className="w-[50%]">
          <div className="border p-4 rounded-lg bg-gray-50 text-xs">
            <p className="font-bold text-gray-700 mb-2 uppercase">Metode Pembayaran Transfer:</p>
            {Number(quotation.taxAmount) > 0 ? (
              <div>
                <p className="font-semibold text-purple-800">Rekening PPN:</p>
                {COMPANY.bankAccountsPPN.map((acc, i) => (
                  <p key={i} className="mt-0.5">
                    {acc.bank} — <strong>{acc.account}</strong> a.n. {acc.holder}
                  </p>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-semibold text-blue-800">Rekening Non-PPN:</p>
                {COMPANY.bankAccountsNonPPN.map((acc, i) => (
                  <p key={i}>
                    {acc.bank} — <strong>{acc.account}</strong> a.n. {acc.holder}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-[45%] text-right font-mono space-y-1.5 border-t-2 pt-2 border-black">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal:</span>
            <span className="font-semibold">
              {formatRupiah(
                (Number(quotation.totalAmount) || 0) +
                  (Number(quotation.discountAmount) || 0) -
                  (Number(quotation.taxAmount) || 0)
              )}
            </span>
          </div>
          {Number(quotation.discountAmount) > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Diskon:</span>
              <span>-{formatRupiah(Number(quotation.discountAmount))}</span>
            </div>
          )}
          {Number(quotation.taxAmount) > 0 && (
            <div className="flex justify-between">
              <span>Pajak (PPN):</span>
              <span>{formatRupiah(Number(quotation.taxAmount))}</span>
            </div>
          )}
          <div className="flex justify-between text-base border-t pt-1.5 font-bold border-gray-300">
            <span>TOTAL KESELURUHAN:</span>
            <span>{formatRupiah(Number(quotation.totalAmount || 0))}</span>
          </div>
        </div>
      </div>

      {/* Signature Section */}
      <div className="grid grid-cols-2 gap-8 text-center text-sm mt-12 pt-6 border-t border-dashed border-gray-200">
        <div>
          <p className="text-gray-500 mb-16">Disetujui Oleh,</p>
          <div className="w-40 border-b border-black mx-auto"></div>
          <p className="mt-1 font-semibold">Pelanggan</p>
        </div>
        <div>
          <p className="text-gray-500 mb-16">Hormat Kami,</p>
          <div className="w-40 border-b border-black mx-auto"></div>
          <p className="mt-1 font-semibold">{COMPANY.signerName}</p>
          <p className="text-xs text-gray-400">{COMPANY.name}</p>
        </div>
      </div>
    </div>
  );
}
