'use client';

import { useEffect } from 'react';

const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function formatIdr(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

interface Payslip {
  id: string;
  status: string;
  notes: string | null;
  baseSalary: number;
  allowanceTotal: number;
  thrAmount: number;
  prorationDeduction: number;
  grossPay: number;
  bpjsDeduction: number;
  loanDeduction: number;
  otherDeductions: number;
  deductionTotal: number;
  netPay: number;
  employee: { code: string; name: string };
  allowances: Array<{ name: string; amount: number }>;
  loanPayments: Array<{ amount: number; loan: { loanNumber: string } }>;
}

interface Props {
  period: { year: number; month: number; status: string };
  payslips: Payslip[];
}

export function PayslipPrintView({ period, payslips }: Props) {
  useEffect(() => {
    // Auto-trigger print dialog after render
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, []);

  const monthName = MONTH_NAMES[period.month - 1];

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 15mm; }
          .payslip-card { break-after: page; page-break-after: always; }
          .payslip-card:last-child { break-after: auto; page-break-after: auto; }
        }
        @media screen {
          .print-area { max-width: 800px; margin: 0 auto; padding: 20px; }
          .payslip-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
        }
        .payslip-card h2 { font-size: 18px; font-weight: 700; margin: 0 0 4px 0; }
        .payslip-card .subtitle { font-size: 13px; color: #6b7280; margin: 0 0 16px 0; }
        .payslip-card .info-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
        .payslip-card .info-row .label { color: #6b7280; }
        .payslip-card .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin: 16px 0 8px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        .payslip-card .line { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; }
        .payslip-card .line.indent { padding-left: 16px; color: #6b7280; }
        .payslip-card .line.total { font-weight: 700; border-top: 1px solid #e5e7eb; margin-top: 4px; padding-top: 6px; }
        .payslip-card .line.deduction .amount { color: #dc2626; }
        .payslip-card .net-pay { font-size: 20px; font-weight: 800; text-align: right; margin-top: 12px; padding-top: 8px; border-top: 2px solid #111827; }
        .payslip-card .draft-badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-left: 8px; }
        .payslip-card .footer { font-size: 10px; color: #9ca3af; text-align: center; margin-top: 20px; }
      `}</style>

      <div className="no-print fixed top-4 right-4 z-50">
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 shadow-lg"
        >
          🖨️ Cetak
        </button>
      </div>

      <div className="print-area">
        {payslips.map((p) => (
          <div key={p.id} className="payslip-card">
            <h2>
              Slip Gaji Bulanan
              {p.status !== 'FINALIZED' && p.status !== 'PAID' && (
                <span className="draft-badge">DRAFT — BELUM FINAL</span>
              )}
            </h2>
            <p className="subtitle">Periode: {monthName} {period.year}</p>

            <div className="info-row">
              <span className="label">Kode Karyawan</span>
              <span>{p.employee.code}</span>
            </div>
            <div className="info-row">
              <span className="label">Nama</span>
              <span>{p.employee.name}</span>
            </div>

            <div className="section-title">Pendapatan</div>
            <div className="line">
              <span>Gaji Pokok</span>
              <span>{formatIdr(p.baseSalary)}</span>
            </div>
            {p.allowances.map((a, i) => (
              <div key={i} className="line indent">
                <span>{a.name}</span>
                <span>{formatIdr(a.amount)}</span>
              </div>
            ))}
            {p.thrAmount > 0 && (
              <div className="line">
                <span>THR</span>
                <span>{formatIdr(p.thrAmount)}</span>
              </div>
            )}
            <div className="line total">
              <span>Gross Pay</span>
              <span>{formatIdr(p.grossPay)}</span>
            </div>

            <div className="section-title">Potongan</div>
            {p.bpjsDeduction > 0 && (
              <div className="line deduction">
                <span>BPJS</span>
                <span className="amount">-{formatIdr(p.bpjsDeduction)}</span>
              </div>
            )}
            {p.loanPayments.map((lp, i) => (
              <div key={i} className="line deduction">
                <span>Kasbon ({lp.loan.loanNumber})</span>
                <span className="amount">-{formatIdr(lp.amount)}</span>
              </div>
            ))}
            {p.prorationDeduction > 0 && (
              <div className="line deduction">
                <span>Prorata (ABSENT)</span>
                <span className="amount">-{formatIdr(p.prorationDeduction)}</span>
              </div>
            )}
            {p.otherDeductions > 0 && (
              <div className="line deduction">
                <span>Potongan Lain</span>
                <span className="amount">-{formatIdr(p.otherDeductions)}</span>
              </div>
            )}
            <div className="line total deduction">
              <span>Total Potongan</span>
              <span className="amount">-{formatIdr(p.deductionTotal)}</span>
            </div>

            <div className="net-pay">
              <span>Net Pay: </span>
              <span>{formatIdr(p.netPay)}</span>
            </div>

            {p.notes && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>
                <strong>Catatan:</strong> {p.notes}
              </div>
            )}

            <div className="footer">
              Dicetak {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })} — dokumen internal
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
