import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My PolyFlow - Portal Karyawan',
    short_name: 'My PolyFlow',
    description: 'Cek gaji, hasil produksi, absensi - real-time',
    start_url: '/my',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
