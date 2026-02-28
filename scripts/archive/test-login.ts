import { headers } from 'next/headers';

async function testLogin() {
  const url = 'http://melindojaya.localhost:3000/api/auth/callback/credentials'\;
  const formData = new URLSearchParams();
  formData.append('email', 'admin@melindojaya.com');
  formData.append('password', 'halomelindo');
  formData.append('role', 'ADMIN');
  formData.append('csrfToken', ''); // Need CSRF token or it'll fail...
  
  // So auth.actions.ts /authenticate is what we really hit via server action
  // Instead of testing via NextAuth API, let's just log from the auth.ts inside `npm run dev` by modifying it slightly
}
