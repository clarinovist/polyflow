"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ActionResponse } from "@/lib/error-handler";
import { UseFormReturn, Path, FieldValues } from "react-hook-form";

interface UseActionOptions<T, V extends FieldValues> {
    onSuccess?: (data: T) => void;
    onError?: (error: string) => void;
    form?: UseFormReturn<V>;
    successMessage?: string;
}

export function useAction<T, V extends FieldValues>(
    action: (values: V) => Promise<ActionResponse<T>>,
    options?: UseActionOptions<T, V>
) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const execute = async (values: V) => {
        setError(null);

        startTransition(async () => {
            try {
                const result = await action(values);

                if (result.success) {
                    if (options?.successMessage) {
                        toast.success(options.successMessage);
                    }
                    options?.onSuccess?.(result.data as T);
                } else {
                    setError(result.error || "An error occurred");

                    if (result.fieldErrors && options?.form) {
                        Object.entries(result.fieldErrors).forEach(([field, messages]) => {
                            options.form?.setError(field as Path<V>, {
                                type: "server",
                                message: messages[0],
                            });
                        });
                    }

                    if (result.error && !result.fieldErrors) {
                        toast.error(result.error);
                    }

                    options?.onError?.(result.error || "An error occurred");
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : "An unexpected error occurred";
                setError(msg);
                toast.error(msg);
                options?.onError?.(msg);
            }
        });
    };

    return {
        execute,
        isPending,
        error,
        setError,
    };
}
