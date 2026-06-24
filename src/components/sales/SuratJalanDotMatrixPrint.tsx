'use client';

import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

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

const COMPANY = {
  name: 'CV MELINDO JAYA',
  address: 'Puri Niaga RT.005 RW.006, Sawahan, Kel. Jaten,\nKec. Jaten, Karanganyar, Jawa Tengah 57731',
  phone: '0271 82017580, 0271 6882007',
  email: 'jaya.melindo@gmail.com',
  signerName: 'Nugroho Pramono',
};

function formatDate(date: Date): string {
  return format(date, 'dd MMM yyyy', { locale: idLocale });
}

interface SuratJalanDotMatrixPrintProps {
  order: SuratJalanPrintData;
  showButton?: boolean;
}

export function SuratJalanDotMatrixPrint({ order, showButton = true }: SuratJalanDotMatrixPrintProps) {
  const customer = order.salesOrder?.customer;
  const items = order.items ?? [];

  const totalQty = items.reduce((sum, item) => {
    const qty = Number(item.enteredQuantity ?? item.quantity ?? 0);
    return sum + qty;
  }, 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {showButton && (
        <div className="no-print p-4 bg-gray-50 border-b flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            Preview cetak dot matrix — Surat Jalan {order.orderNumber}
          </span>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
          >
            🖨️ Cetak Surat Jalan
          </button>
        </div>
      )}

      <div className="print-page">
        {/* === HEADER === */}
        <div className="doc-header">
          <div className="company-section">
            <div className="company-logo">MJ</div>
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
              <span className="info-value">{customer?.name || '-'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">ALAMAT :</span>
              <span className="info-value">{customer?.shippingAddress || customer?.billingAddress || '-'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">NO SURAT JALAN :</span>
              <span className="info-value">{order.orderNumber}</span>
            </div>
            <div className="info-row">
              <span className="info-label">TGL SURAT JALAN :</span>
              <span className="info-value">{formatDate(new Date(order.deliveryDate))}</span>
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
              const productName = pv?.product?.name || pv?.name || '-';
              const qty = Number(item.enteredQuantity ?? item.quantity ?? 0);
              const unit = item.enteredUnit || pv?.salesUnit || pv?.primaryUnit || '';

              return (
                <tr key={item.id || idx}>
                  <td className="col-name">{productName}</td>
                  <td className="col-qty">{qty}</td>
                  <td className="col-unit">{unit}</td>
                  <td className="col-note">{item.notes || ''}</td>
                </tr>
              );
            })}
            {/* Empty rows to fill space */}
            {items.length < 5 &&
              Array.from({ length: 5 - items.length }).map((_, i) => (
                <tr key={`empty-${i}`} className="empty-row">
                  <td colSpan={4}>&nbsp;</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td className="text-right" colSpan={1}>TOTAL :</td>
              <td className="col-qty">{totalQty}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>

        {/* === CLOSING TEXT === */}
        <div className="closing-section">
          <p className="closing-text">
            Demikian surat jalan ini dibuat dengan sebenar-benarnya, sebagai bukti pengiriman barang.
          </p>
        </div>

        {/* === SIGNATURE SECTION === */}
        <div className="signature-section">
          <div className="sig-left">
            <div className="sig-label">Yang Menerima,</div>
            <div className="sig-space"></div>
            <div className="sig-line">(                        )</div>
          </div>
          <div className="sig-right">
            <div className="sig-label">Hormat kami,</div>
            <div className="sig-space"></div>
            <div className="sig-line">( {COMPANY.signerName} )</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @page {
          size: 21cm 29.7cm;
          margin: 10mm 15mm;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }

        .print-page {
          font-family: 'Courier New', 'Consolas', 'Lucida Console', monospace;
          font-size: 11px;
          line-height: 1.4;
          max-width: 210mm;
          margin: 0 auto;
          padding: 10mm 15mm;
          color: #000;
          background: #fff;
        }

        /* === HEADER === */
        .doc-header {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 8px;
          margin-bottom: 16px;
          border-bottom: 2px solid #000;
          padding-bottom: 12px;
        }

        .company-section {
          display: flex;
          gap: 8px;
        }

        .company-logo {
          font-size: 28px;
          font-weight: bold;
          font-family: 'Times New Roman', serif;
          color: #000;
          line-height: 1;
          border: 2px solid #000;
          padding: 4px 6px;
        }

        .company-details {
          font-size: 10px;
          line-height: 1.5;
        }

        .company-name {
          font-size: 14px;
          font-weight: bold;
        }

        .company-address {
          font-size: 9px;
          white-space: pre-line;
        }

        .company-contact {
          font-size: 9px;
        }

        .title-section {
          font-size: 18px;
          font-weight: bold;
          text-align: center;
          padding-top: 20px;
        }

        .info-section {
          text-align: right;
          font-size: 10px;
        }

        .info-row {
          margin-bottom: 2px;
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
          margin-bottom: 12px;
          font-size: 10px;
        }

        .items-table th,
        .items-table td {
          border: 1px solid #000;
          padding: 4px 6px;
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
          height: 20px;
        }

        /* === CLOSING === */
        .closing-section {
          margin: 12px 0;
        }

        .closing-text {
          font-size: 10px;
          font-style: italic;
        }

        /* === SIGNATURES === */
        .signature-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-top: 20px;
          font-size: 10px;
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
          height: 60px;
        }

        .sig-line {
          font-style: italic;
        }
      `}</style>
    </>
  );
}
