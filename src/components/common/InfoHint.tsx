'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

/** Supplemental help: hover/focus on desktop, toggle by tap without requiring hover. */
export function InfoHint({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const pointerActivationRef = useRef(false);

    return (
        <Tooltip open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
                <button
                    ref={triggerRef}
                    type="button"
                    aria-label={label}
                    aria-expanded={open}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(any-pointer:coarse)]:size-11"
                    // Keep Radix hover, focus, Escape, and outside-dismiss behavior.
                    // Pointer activation toggles for touch; keyboard activation keeps
                    // a focus-open hint available instead of immediately closing it.
                    onPointerDown={(event) => {
                        pointerActivationRef.current = true;
                        event.preventDefault();
                    }}
                    onPointerCancel={() => {
                        pointerActivationRef.current = false;
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        if (pointerActivationRef.current) {
                            pointerActivationRef.current = false;
                            setOpen((current) => !current);
                            return;
                        }
                        if (event.detail === 0) {
                            setOpen(true);
                            return;
                        }
                        setOpen((current) => !current);
                    }}
                >
                    <Info aria-hidden="true" className="size-4" />
                </button>
            </TooltipTrigger>
            <TooltipContent
                side="top"
                sideOffset={6}
                collisionPadding={12}
                onPointerDownOutside={(event) => {
                    // Let the trigger's click toggle, rather than closing on
                    // pointer-down then reopening on the same click.
                    if (triggerRef.current?.contains(event.target as Node)) {
                        event.preventDefault();
                    }
                }}
                className="max-w-[min(20rem,calc(100vw-2rem))] space-y-2 text-left text-xs leading-relaxed"
            >
                {children}
            </TooltipContent>
        </Tooltip>
    );
}
