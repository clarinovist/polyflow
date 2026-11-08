import * as React from 'react';

import { cn } from '@/lib/utils/utils';

/**
 * Native <select> yang tampil seragam dengan `Input` (token warna, 44px di
 * layar sentuh). Dipakai di form mobile yang butuh picker bawaan OS dan
 * handler `onChange` standar, bukan dropdown Radix.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
    return (
        <select
            data-slot="native-select"
            className={cn(
                'border-input bg-background text-foreground h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm pointer-coarse:h-11',
                'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            {...props}
        />
    );
}

export { NativeSelect };
