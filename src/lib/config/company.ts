/**
 * Company configuration for print templates.
 * Reads from env vars with fallback to Melindo Jaya defaults.
 *
 * For multi-tenant: set these env vars per deployment.
 * Logo: provide a public URL or path (e.g. /logos/melindo.png).
 */

export interface BankAccount {
  holder: string;
  bank: string;
  account: string;
}

export interface CompanyConfig {
  name: string;
  logoUrl: string | null;
  address: string;
  phone: string;
  email: string;
  bankAccountsNonPPN: BankAccount[];
  bankAccountsPPN: BankAccount[];
  footerNote: string;
  signerName: string;
}

function parseBankAccounts(json: string | undefined): BankAccount[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getCompanyConfig(): CompanyConfig {
  return {
    name: process.env.COMPANY_NAME || 'CV MELINDO JAYA',
    logoUrl: process.env.COMPANY_LOGO_URL || null,
    address: process.env.COMPANY_ADDRESS || 'Puri Niaga RT.005 RW.006, Sawahan, Kel. Jaten,\nKec. Jaten, Karanganyar, Jawa Tengah 57731',
    phone: process.env.COMPANY_PHONE || '0271 82017580, 0271 6882007',
    email: process.env.COMPANY_EMAIL || 'jaya.melindo@gmail.com',
    bankAccountsNonPPN: parseBankAccounts(process.env.BANK_ACCOUNTS_NON_PPN) || [
      { holder: 'Nugroho Pramono', bank: 'Bank BCA', account: '7735006002' },
      { holder: 'Nugroho Pramono', bank: 'Bank BRI', account: '671401042839531' },
      { holder: 'Nugroho Pramono', bank: 'Bank Mandiri', account: '1380556667777' },
    ],
    bankAccountsPPN: parseBankAccounts(process.env.BANK_ACCOUNTS_PPN) || [
      { holder: 'MELINDO JAYA', bank: 'BANK BCA', account: '3270448789' },
      { holder: 'MELINDO JAYA', bank: 'BANK MANDIRI', account: '1380044458789' },
    ],
    footerNote: process.env.COMPANY_FOOTER_NOTE || 'BARANG YANG SUDAH DITERIMA TIDAK BISA DIKEMBALIKAN',
    signerName: process.env.COMPANY_SIGNER_NAME || 'Nugroho Pramono',
  };
}
