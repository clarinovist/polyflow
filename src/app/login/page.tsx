import { headers } from 'next/headers';
import LoginClient from './client';

export default async function LoginPage() {
    const headersList = await headers();
    const subdomain = headersList.get('x-tenant-subdomain');

    return <LoginClient subdomain={subdomain} />;
}
