export const metadata = {
  title: 'Slip Gaji — Print',
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-white">{children}</body>
    </html>
  );
}
