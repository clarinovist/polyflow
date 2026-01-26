'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Languages } from 'lucide-react';

import { toast } from 'sonner';

export function LanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();

    const handleLocaleChange = (newLocale: string) => {
        try {
            router.replace(pathname, { locale: newLocale });
            toast.success(newLocale === 'id' ? 'Bahasa diubah ke Indonesia' : 'Language changed to English');
        } catch (error) {
            console.error('Failed to change locale:', error);
            toast.error(locale === 'id' ? 'Gagal mengubah bahasa' : 'Failed to change language');
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                    <Languages className="h-4 w-4" />
                    <span className="sr-only">Switch Language</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleLocaleChange('id')} className={locale === 'id' ? 'bg-accent' : ''}>
                    Bahasa Indonesia
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleLocaleChange('en')} className={locale === 'en' ? 'bg-accent' : ''}>
                    English
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
