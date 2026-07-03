"use client";

import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { getCompanyConfig, type CompanyConfig } from "@/lib/config/company";

type DeliveryItem = {
  id?: string;
  quantity?: unknown;
  enteredQuantity?: unknown;
  enteredUnit?: string | null;
  notes?: string | null;
  productVariant?: {
    name?: string;
    primaryUnit?: string | null;
    salesUnit?: string | null;
    product?: { name?: string };
  };
};

interface SuratJalanPrintData {
  orderNumber: string;
  deliveryDate: Date;
  status?: string;
  salesOrder?: {
    orderNumber?: string;
    customer?: {
      name: string;
      phone?: string | null;
      email?: string | null;
      billingAddress?: string | null;
      shippingAddress?: string | null;
    } | null;
  } | null;
  items?: DeliveryItem[];
}

// Company config loaded from env vars — see src/lib/config/company.ts

function formatDate(date: Date): string {
  return format(date, "dd MMM yyyy", { locale: idLocale });
}

interface SuratJalanDotMatrixPrintProps {
  order: SuratJalanPrintData;
  showButton?: boolean;
  previewMode?: boolean;
  companyConfig?: CompanyConfig;
}

export function SuratJalanDotMatrixPrint({
  order,
  showButton = true,
  previewMode = false,
  companyConfig,
}: SuratJalanDotMatrixPrintProps) {
  const COMPANY: CompanyConfig = companyConfig || getCompanyConfig();
  const customer = order.salesOrder?.customer;
  const items = order.items ?? [];

  const totalQty = items.reduce((sum, item) => {
    const qty = Number(item.enteredQuantity ?? item.quantity ?? 0);
    return sum + qty;
  }, 0);

  const { paperSize } = COMPANY;

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {showButton && !previewMode && (
        <div className="no-print p-4 bg-gray-50 border-b flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            Preview cetak dot matrix — Surat Jalan {order.orderNumber}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
            >
              📄 Export PDF
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
            >
              🖨️ Cetak Surat Jalan
            </button>
          </div>
        </div>
      )}

      <div className="print-page">
        {/* === HEADER === */}
        <div className="doc-header">
          <div className="company-section">
            {COMPANY.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={COMPANY.logoUrl}
                alt={COMPANY.name}
                className="company-logo-img"
              />
            ) : (
              <div className="company-logo">MJ</div>
            )}
            <div className="company-details">
              <div className="company-name">{COMPANY.name}</div>
              <div className="company-address">{COMPANY.address}</div>
              <div className="company-contact">Telp : {COMPANY.phone}</div>
              <div className="company-contact">Email : {COMPANY.email}</div>
            </div>
          </div>

          <div className="title-section">SURAT JALAN</div>

          <div className="info-section">
            <div className="info-row">
              <span className="info-label">NAMA PELANGGAN :</span>
              <span className="info-value">{customer?.name || "-"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">ALAMAT :</span>
              <span className="info-value">
                {customer?.shippingAddress || customer?.billingAddress || "-"}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">NO SURAT JALAN :</span>
              <span className="info-value">{order.orderNumber}</span>
            </div>
            <div className="info-row">
              <span className="info-label">TGL SURAT JALAN :</span>
              <span className="info-value">
                {formatDate(new Date(order.deliveryDate))}
              </span>
            </div>
          </div>
        </div>

        {/* === ITEMS TABLE === */}
        <table className="items-table">
          <thead>
            <tr>
              <th className="col-name">Nama Barang</th>
              <th className="col-qty">Qty</th>
              <th className="col-unit">Satuan</th>
              <th className="col-note">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const pv = item.productVariant;
              const productName = pv?.product?.name || pv?.name || "-";
              const qty = Number(item.enteredQuantity ?? item.quantity ?? 0);
              const unit =
                item.enteredUnit || pv?.salesUnit || pv?.primaryUnit || "";

              return (
                <tr key={item.id || idx}>
                  <td className="col-name">{productName}</td>
                  <td className="col-qty">{qty}</td>
                  <td className="col-unit">{unit}</td>
                  <td className="col-note">{item.notes || ""}</td>
                </tr>
              );
            })}
            {/* Empty rows to fill space */}
            {items.length < 4 &&
              Array.from({ length: 4 - items.length }).map((_, i) => (
                <tr key={`empty-${i}`} className="empty-row">
                  <td colSpan={4}>&nbsp;</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td className="text-right" colSpan={1}>
                TOTAL :
              </td>
              <td className="col-qty">{totalQty}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>

        {/* === CLOSING TEXT === */}
        <div className="closing-section">
          <p className="closing-text">
            Demikian surat jalan ini dibuat dengan sebenar-benarnya, sebagai
            bukti pengiriman barang.
          </p>
        </div>

        {/* === SIGNATURE SECTION === */}
        <div className="signature-section">
          <div className="sig-left">
            <div className="sig-label">Yang Menerima,</div>
            <div className="sig-space"></div>
            <div className="sig-line">( )</div>
          </div>
          <div className="sig-right">
            <div className="sig-label">Hormat kami,</div>
            <div className="sig-space"></div>
            <div className="sig-line">( {COMPANY.signerName} )</div>
          </div>
        </div>
      </div>

      {/* Dynamic @page from company paper size config */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @page {
          size: ${paperSize.widthCm}cm ${paperSize.heightCm}cm landscape;
          margin: ${paperSize.marginMm}mm;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          body {
            margin: 0;
            padding: 0;
          }
          html, body {
            width: ${paperSize.widthCm}cm;
            min-height: ${paperSize.heightCm}cm;
          }
          .print-page {
            width: ${paperSize.widthCm}cm;
            min-height: ${paperSize.heightCm}cm;
            max-width: none;
            margin: 0;
            box-sizing: border-box;
          }
        }
      `,
        }}
      />

      <style>{`
        .print-page {
          font-family: 'Courier New', 'Consolas', 'Lucida Console', monospace;
          font-size: 9px;
          line-height: 1.3;
          width: 100%;
          max-width: ${paperSize.widthCm}cm;
          min-height: ${paperSize.heightCm}cm;
          margin: 0 auto;
          padding: ${paperSize.marginMm}mm;
          color: #000;
          background: #fff;
          box-sizing: border-box;
        }

        /* === HEADER === */
        .doc-header {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 4px;
          margin-bottom: 4px;
          border-bottom: 1px solid #000;
          padding-bottom: 4px;
        }

        .company-section {
          display: flex;
          gap: 4px;
        }

        .company-logo {
          font-size: 20px;
          font-weight: bold;
          font-family: 'Times New Roman', serif;
          color: #000;
          line-height: 1;
          border: 1px solid #000;
          padding: 2px 4px;
        }

        .company-logo-img {
          max-height: 40px;
          max-width: 50px;
          object-fit: contain;
        }

        .company-details {
          font-size: 8px;
          line-height: 1.3;
        }

        .company-name {
          font-size: 11px;
          font-weight: bold;
        }

        .company-address {
          font-size: 7px;
          white-space: pre-line;
        }

        .company-contact {
          font-size: 7px;
        }

        .title-section {
          font-size: 14px;
          font-weight: bold;
          text-align: center;
          padding-top: 10px;
        }

        .info-section {
          text-align: right;
          font-size: 8px;
        }

        .info-row {
          margin-bottom: 1px;
        }

        .info-label {
          font-weight: bold;
        }

        .info-value {
          margin-left: 4px;
        }

        /* === ITEMS TABLE === */
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 4px;
          font-size: 8px;
        }

        .items-table th,
        .items-table td {
          border: 1px solid #000;
          padding: 1px 3px;
        }

        .items-table th {
          background-color: #f0f0f0;
          font-weight: bold;
          text-align: center;
        }

        .col-name {
          text-align: left;
          width: 40%;
        }

        .col-qty {
          text-align: center;
          width: 10%;
        }

        .col-unit {
          text-align: center;
          width: 15%;
        }

        .col-note {
          text-align: left;
          width: 35%;
        }

        .items-table tfoot td {
          font-weight: bold;
          text-align: right;
        }

        .empty-row td {
          height: 14px;
        }

        /* === CLOSING === */
        .closing-section {
          margin: 4px 0;
        }

        .closing-text {
          font-size: 8px;
          font-style: italic;
        }

        /* === SIGNATURES === */
        .signature-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-top: 10px;
          font-size: 8px;
        }

        .sig-left {
          text-align: left;
        }

        .sig-right {
          text-align: right;
        }

        .sig-label {
          font-weight: bold;
        }

        .sig-space {
          height: 30px;
        }

        .sig-line {
          font-style: italic;
        }
      `}</style>
    </>
  );
}
