"use client";

import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { getCompanyConfig, type CompanyConfig } from "@/lib/config/company";
import { terbilang } from "@/lib/utils/terbilang";
import { InvoiceStatus } from "@prisma/client";

type InvoiceLineItem = {
  id?: string;
  quantity?: unknown;
  unitPrice?: unknown;
  subtotal?: unknown;
  enteredQuantity?: unknown;
  enteredUnit?: string | null;
  enteredUnitPrice?: unknown;
  productVariant?: {
    name?: string;
    primaryUnit?: string | null;
    salesUnit?: string | null;
    product?: { name?: string };
  };
};

interface InvoicePrintData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  status: InvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  salesOrder?: {
    orderNumber: string;
    taxAmount?: unknown;
    customer?: {
      name: string;
      phone?: string | null;
      email?: string | null;
      billingAddress?: string | null;
      shippingAddress?: string | null;
      taxId?: string | null;
    } | null;
    items?: InvoiceLineItem[];
  } | null;
}

// Company config loaded from env vars — see src/lib/config/company.ts

function formatNumberWithDots(n: number): string {
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(date: Date): string {
  return format(date, "dd MMM yyyy", { locale: idLocale });
}

interface InvoiceDotMatrixPrintProps {
  invoice: InvoicePrintData;
  showButton?: boolean;
  previewMode?: boolean;
  companyConfig?: CompanyConfig;
}

export function InvoiceDotMatrixPrint({
  invoice,
  showButton = true,
  previewMode = false,
  companyConfig,
}: InvoiceDotMatrixPrintProps) {
  const COMPANY: CompanyConfig = companyConfig || getCompanyConfig();
  const so = invoice.salesOrder;
  const customer = so?.customer;
  const items = so?.items ?? [];
  const taxAmount = Number(so?.taxAmount || 0);
  const isPPN = taxAmount > 0;

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.subtotal || 0),
    0,
  );
  const totalQty = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  const grandTotal = Number(invoice.totalAmount);
  const dppLain = 0;
  const coretax = 0;
  const potongan = 0;
  const sisaTagihan = grandTotal - Number(invoice.paidAmount);

  const { paperSize } = COMPANY;

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {showButton && !previewMode && (
        <div className="no-print p-4 bg-gray-50 border-b flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            Preview cetak dot matrix — {invoice.invoiceNumber}
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
              🖨️ Cetak Invoice
            </button>
          </div>
        </div>
      )}

      <div className="print-page">
        {/* === HEADER === */}
        <div className="invoice-header">
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

          <div className="title-section">INVOICE</div>

          <div className="customer-section">
            <div className="customer-row">
              <span className="customer-label">NAMA PELANGGAN :</span>
              <span className="customer-value">{customer?.name || "-"}</span>
            </div>
            <div className="customer-row">
              <span className="customer-label">ALAMAT :</span>
              <span className="customer-value">
                {customer?.billingAddress || "-"}
              </span>
            </div>
            <div className="customer-row">
              <span className="customer-label">NPWP :</span>
              <span className="customer-value">{customer?.taxId || "-"}</span>
            </div>
            <div className="customer-row">
              <span className="customer-label">NO INVOICE :</span>
              <span className="customer-value">{invoice.invoiceNumber}</span>
            </div>
            <div className="customer-row">
              <span className="customer-label">TGL INVOICE :</span>
              <span className="customer-value">
                {formatDate(new Date(invoice.invoiceDate))}
              </span>
            </div>
            <div className="customer-row">
              <span className="customer-label">TGL JATUH TEMPO :</span>
              <span className="customer-value">
                {invoice.dueDate ? formatDate(new Date(invoice.dueDate)) : "-"}
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
              <th className="col-price">Harga @</th>
              <th className="col-disc">Diskon</th>
              <th className="col-total">Jumlah (Rp)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const pv = item.productVariant;
              const productName = pv?.product?.name || pv?.name || "-";
              const qty = Number(item.enteredQuantity || item.quantity || 0);
              const unit =
                item.enteredUnit || pv?.salesUnit || pv?.primaryUnit || "";
              const unitPrice = Number(
                item.enteredUnitPrice || item.unitPrice || 0,
              );
              const lineTotal = Number(item.subtotal || 0);

              return (
                <tr key={item.id || idx}>
                  <td className="col-name">{productName}</td>
                  <td className="col-qty">{qty}</td>
                  <td className="col-unit">{unit}</td>
                  <td className="col-price">
                    {formatNumberWithDots(unitPrice)}
                  </td>
                  <td className="col-disc">0</td>
                  <td className="col-total">
                    {formatNumberWithDots(lineTotal)}
                  </td>
                </tr>
              );
            })}
            {/* Empty rows to fill space like the screenshot */}
            {items.length < 3 &&
              Array.from({ length: 3 - items.length }).map((_, i) => (
                <tr key={`empty-${i}`} className="empty-row">
                  <td colSpan={6}>&nbsp;</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan={1} className="text-right">
                TOTAL :
              </td>
              <td className="col-qty">{totalQty}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>

        {/* === TERBILANG === */}
        <div className="terbilang-section">
          <div className="terbilang-text">
            Terbilang : {terbilang(grandTotal)}
          </div>
          <div className="financial-summary">
            <div className="summary-row">
              <span>SUBTOTAL :</span>
              <span>{formatNumberWithDots(subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>DPP Nilai Lain</span>
              <span>{formatNumberWithDots(dppLain)}</span>
            </div>
            <div className="summary-row">
              <span>Coretax</span>
              <span>{formatNumberWithDots(coretax)}</span>
            </div>
            <div className="summary-row bold">
              <span>TOTAL :</span>
              <span>{formatNumberWithDots(grandTotal)}</span>
            </div>
            <div className="summary-row">
              <span>POTONGAN :</span>
              <span>{formatNumberWithDots(potongan)}</span>
            </div>
            <div className="summary-row bold">
              <span>SISA TAGIHAN :</span>
              <span className="highlight">
                {formatNumberWithDots(sisaTagihan)}
              </span>
            </div>
          </div>
        </div>

        {/* === FOOTER === */}
        <div className="invoice-footer">
          <div className="footer-left">
            <div className="keterangan-label">KETERANGAN BANK :</div>
            <div className="bank-type-label">
              {isPPN ? "(Penjualan PPN)" : "(Penjualan Non PPN)"}
            </div>
            <div className="bank-account">
              A/N{" "}
              {(isPPN ? COMPANY.bankAccountsPPN : COMPANY.bankAccountsNonPPN)[0]
                ?.holder || COMPANY.name}
            </div>
            {(isPPN ? COMPANY.bankAccountsPPN : COMPANY.bankAccountsNonPPN).map(
              (acc) => (
                <div key={acc.account} className="bank-account">
                  {acc.bank} : {acc.account}
                </div>
              ),
            )}
          </div>

          <div className="footer-spacer"></div>

          <div className="footer-right">
            <div className="hormat-text">Hormat kami,</div>
            <div className="signature-space"></div>
            <div className="signer-name">( {COMPANY.signerName} )</div>
          </div>
        </div>

        {/* === NOTE === */}
        <div className="invoice-note">NOTE :{COMPANY.footerNote}</div>
      </div>

      {/* Dynamic @page from company paper size config */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @page {
          size: auto;
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
          .print-page {
            page-break-inside: avoid;
            page-break-after: avoid;
          }
        }
      `,
        }}
      />

      <style>{`
        .print-page {
          font-family: 'Courier New', 'Consolas', 'Lucida Console', monospace;
          font-size: 10px;
          line-height: 1.4;
          width: 100%;
          max-width: ${paperSize.widthCm}cm;
          margin: 0 auto;
          padding: ${paperSize.marginMm}mm;
          color: #000;
          background: #fff;
          box-sizing: border-box;
        }

        /* === HEADER === */
        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 8px;
          border-bottom: 1.5px solid #000;
          padding-bottom: 8px;
          flex-wrap: wrap;
        }

        .company-section {
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }

        .company-logo {
          font-size: 22px;
          font-weight: bold;
          font-family: 'Times New Roman', serif;
          color: #000;
          line-height: 1;
          border: 1.5px solid #000;
          padding: 3px 6px;
        }

        .company-logo-img {
          max-height: 45px;
          max-width: 55px;
          object-fit: contain;
        }

        .company-details {
          font-size: 9px;
          line-height: 1.4;
        }

        .company-name {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 2px;
        }

        .company-address {
          font-size: 8px;
          white-space: pre-line;
        }

        .company-contact {
          font-size: 8px;
        }

        .title-section {
          font-size: 16px;
          font-weight: bold;
          text-align: center;
          padding-top: 12px;
          letter-spacing: 2px;
        }

        .customer-section {
          text-align: right;
          font-size: 9px;
          line-height: 1.5;
        }

        .customer-row {
          margin-bottom: 1px;
        }

        .customer-label {
          font-weight: bold;
        }

        .customer-value {
          margin-left: 6px;
        }

        /* === ITEMS TABLE === */
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 8px;
          font-size: 9px;
        }

        .items-table th,
        .items-table td {
          border: 1px solid #000;
          padding: 3px 5px;
        }

        .items-table th {
          background-color: #f0f0f0;
          font-weight: bold;
          text-align: center;
        }

        .col-name {
          text-align: left;
          width: 35%;
        }

        .col-qty {
          text-align: center;
          width: 8%;
        }

        .col-unit {
          text-align: center;
          width: 12%;
        }

        .col-price {
          text-align: right;
          width: 15%;
        }

        .col-disc {
          text-align: right;
          width: 10%;
        }

        .col-total {
          text-align: right;
          width: 20%;
        }

        .items-table tfoot td {
          font-weight: bold;
          text-align: right;
        }

        .empty-row td {
          height: 14px;
        }

        /* === TERBILANG === */
        .terbilang-section {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          margin-bottom: 8px;
          border: 1px solid #000;
          padding: 5px;
        }

        .terbilang-text {
          font-style: italic;
          font-size: 9px;
        }

        .financial-summary {
          font-size: 9px;
          min-width: 150px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 0;
          line-height: 1.5;
        }

        .summary-row.bold {
          font-weight: bold;
        }

        .summary-row .highlight {
          font-weight: bold;
          font-size: 10px;
          border: 1px solid #000;
          padding: 0 3px;
        }

        /* === FOOTER === */
        .invoice-footer {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-top: 8px;
          font-size: 9px;
        }

        .footer-left {
          border: 1px solid #000;
          padding: 5px;
        }

        .keterangan-label {
          font-weight: bold;
          margin-bottom: 2px;
        }

        .bank-type-label {
          font-style: italic;
          margin-bottom: 3px;
          font-size: 8px;
        }

        .bank-account {
          margin-bottom: 0;
          line-height: 1.4;
        }

        .footer-spacer {
          /* Flex spacer */
          flex: 1;
        }

        .footer-right {
          text-align: right;
          padding-top: 6px;
        }

        .hormat-text {
          margin-bottom: 35px;
        }

        .signer-name {
          font-style: italic;
        }

        /* === NOTE === */
        .invoice-note {
          margin-top: 6px;
          padding-top: 3px;
          border-top: 1px solid #000;
          font-size: 8px;
          font-weight: bold;
        }
      `}</style>
    </>
  );
}
