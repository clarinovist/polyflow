import { Metadata } from 'next';
import AdminLoginClient from './AdminLoginClient';

export const metadata: Metadata = {
    title: 'System Access | PolyFlow ERP',
    description: 'Restricted system administration access',
    robots: {
        index: false,
        follow: false,
    },
};

export default function AdminLoginPage() {
    return <AdminLoginClient />;
}
