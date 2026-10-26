import { redirect } from 'next/navigation';

// Potong/Plong is now recorded through Catat Hasil on the SPK. Tablets that
// still have this page open or bookmarked go back to the hub instead of a 404.
export default function PotongPlongKioskPage() {
    redirect('/kiosk');
}
