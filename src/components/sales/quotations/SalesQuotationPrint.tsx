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
  subject?: string | null;
  paymentTerms?: string | null;
  shippingTerms?: string | null;
  termsConditions?: string | null;
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
    <div className="p-8 text-black bg-white font-sans max-w-4xl mx-auto" style={{ fontSize: "13px", lineHeight: "1.6" }}>
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

      {/* Header Kop Surat */}
      <div className="flex items-start gap-4 border-b-2 border-black pb-4 mb-6">
        <div className="flex-1">
          <h1 className="text-xl font-bold uppercase tracking-wider text-gray-800">{COMPANY.name}</h1>
          <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed mt-1">{COMPANY.address}</p>
          <p className="text-xs text-gray-600 mt-1">Telp: {COMPANY.phone} | Email: {COMPANY.email}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 font-semibold uppercase">Surat Penawaran Harga</div>
          <div className="text-xs text-gray-500 font-mono mt-1">
            Karanganyar, {format(new Date(quotation.quotationDate), "dd MMMM yyyy", { locale: idLocale })}
          </div>
        </div>
      </div>

      {/* Letter Meta (Nomor, Hal, Lampiran) & Customer Destination */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <table className="w-full text-xs border-none self-start">
            <tbody>
              <tr>
                <td className="w-16 font-semibold py-1">Nomor</td>
                <td className="w-4 py-1">:</td>
                <td className="font-mono py-1">{quotation.quotationNumber}</td>
              </tr>
              <tr>
                <td className="font-semibold py-1">Hal</td>
                <td className="py-1">:</td>
                <td className="py-1">{quotation.subject || "Penawaran Harga Produk Plastik"}</td>
              </tr>
              <tr>
                <td className="font-semibold py-1">Lampiran</td>
                <td className="py-1">:</td>
                <td className="py-1">-</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="pl-4 border-l border-gray-200">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Kepada Yth.</p>
          <p className="font-bold text-gray-800">{customer?.name || "Prospect Customer"}</p>
          <p className="text-xs text-gray-600 whitespace-pre-line mt-1">
            {customer?.shippingAddress || customer?.billingAddress || "Gudang Pembeli"}
          </p>
          {customer?.phone && <p className="text-xs text-gray-600 mt-1">Telp: {customer.phone}</p>}
        </div>
      </div>

      {/* Opening Letter Text */}
      <div className="mb-6 text-justify">
        <p className="mb-3">Dengan hormat,</p>
        <p>
          Sehubungan dengan adanya permintaan penawaran harga produk dari pihak Bapak/Ibu, bersama surat ini kami mengajukan penawaran harga terbaik untuk produk-produk berkualitas kami dengan rincian harga sebagai berikut:
        </p>
      </div>

      {/* Items Table */}
      <table className="w-full text-xs border-collapse mb-6">
        <thead>
          <tr className="border-y-2 border-black bg-gray-50 font-semibold">
            <th className="py-2 text-left px-2">Nama Produk / Varian</th>
            <th className="py-2 text-right px-2 w-[120px]">Kuantitas</th>
            <th className="py-2 text-right px-2 w-[140px]">Harga Satuan</th>
            <th className="py-2 text-right px-2 w-[80px]">Diskon</th>
            <th className="py-2 text-right px-2 w-[80px]">Pajak</th>
            <th className="py-2 text-right px-2 w-[150px]">Total Penawaran</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const qtyDisp = getEnteredQuantityDisplay({ ...item, ...item.productVariant });
            const priceDisp = getEnteredUnitPriceDisplay({ ...item, ...item.productVariant });
            return (
              <tr key={item.id || index} className="border-b border-gray-200 hover:bg-gray-50/10">
                <td className="py-2 px-2">
                  <div className="font-semibold text-gray-800">
                    {item.productVariant?.product?.name || item.productVariant?.name || "Produk"}
                  </div>
                  {item.productVariant?.name && (
                    <div className="text-[10px] text-gray-500">{item.productVariant.name}</div>
                  )}
                </td>
                <td className="py-2 text-right px-2 font-mono">{qtyDisp}</td>
                <td className="py-2 text-right px-2 font-mono">
                  {formatRupiah(priceDisp.price)}/{priceDisp.unit}
                </td>
                <td className="py-2 text-right px-2 text-red-600 font-mono">
                  {Number(item.discountPercent) > 0 ? `${Number(item.discountPercent)}%` : "-"}
                </td>
                <td className="py-2 text-right px-2 font-mono">
                  {Number(item.taxPercent) > 0 ? `${Number(item.taxPercent)}%` : "-"}
                </td>
                <td className="py-2 text-right px-2 font-semibold font-mono">
                  {formatRupiah(Number(item.subtotal))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Summary and Terms */}
      <div className="grid grid-cols-2 gap-8 items-start mb-6">
        {/* Terms & Conditions Column */}
        <div className="text-xs space-y-2">
          <p className="font-semibold text-gray-700 uppercase tracking-wider">Syarat & Ketentuan Penawaran:</p>
          <div className="border rounded-md p-3 bg-gray-50/50 space-y-1.5 leading-relaxed text-gray-600">
            {quotation.paymentTerms && (
              <p>• <strong>Syarat Pembayaran:</strong> {quotation.paymentTerms}</p>
            )}
            {quotation.shippingTerms && (
              <p>• <strong>Metode Pengiriman:</strong> {quotation.shippingTerms}</p>
            )}
            {quotation.validUntil && (
              <p>• <strong>Masa Berlaku Penawaran:</strong> S/D {format(new Date(quotation.validUntil), "dd MMMM yyyy", { locale: idLocale })}</p>
            )}
            {quotation.termsConditions ? (
              <div className="mt-2 pt-2 border-t border-gray-200 whitespace-pre-line text-[11px]">
                {quotation.termsConditions}
              </div>
            ) : (
              <p className="text-[10px] text-gray-400">Harga franco pabrik dan dapat dinegosiasikan sebelum pemesanan.</p>
            )}
          </div>
        </div>

        {/* Totals Column */}
        <div className="font-mono text-xs space-y-1.5 border-t pt-2 border-gray-300">
          <div className="flex justify-between">
            <span className="text-gray-500 font-sans">Subtotal Penawaran:</span>
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
              <span className="font-sans">Diskon Penawaran:</span>
              <span>-{formatRupiah(Number(quotation.discountAmount))}</span>
            </div>
          )}
          {Number(quotation.taxAmount) > 0 && (
            <div className="flex justify-between">
              <span className="font-sans">Pajak (PPN 11%):</span>
              <span>{formatRupiah(Number(quotation.taxAmount))}</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t-2 pt-1.5 font-bold border-black">
            <span className="font-sans">TOTAL PENAWARAN:</span>
            <span>{formatRupiah(Number(quotation.totalAmount || 0))}</span>
          </div>
        </div>
      </div>

      {/* Closing Letter Text */}
      <div className="mb-8 text-justify">
        <p>
          Demikian surat penawaran harga ini kami sampaikan. Besar harapan kami untuk dapat menerima kabar baik serta menjalin kerja sama kemitraan yang saling menguntungkan dengan pihak Bapak/Ibu di masa mendatang. Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.
        </p>
      </div>

      {/* Signatures */}
      <div className="flex justify-end text-center text-xs mt-8">
        <div className="w-56">
          <p className="text-gray-500 mb-16">Hormat Kami,</p>
          <div className="w-40 border-b border-black mx-auto"></div>
          <p className="mt-1 font-semibold">{COMPANY.signerName}</p>
          <p className="text-[10px] text-gray-400">{COMPANY.name}</p>
        </div>
      </div>
    </div>
  );
}
