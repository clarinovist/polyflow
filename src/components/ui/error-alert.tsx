import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ErrorAlertProps {
    error?: string | null;
    className?: string;
    variant?: "destructive" | "warning";
}

export function ErrorAlert({ error, className, variant = "destructive" }: ErrorAlertProps) {
    if (!error) return null;

    // Map "warning" to "default" if needed, or just use "destructive" for now
    // since the shadcn Alert usually only has default and destructive
    const alertVariant = variant === "warning" ? "default" : "destructive";

    return (
        <Alert variant={alertVariant} className={cn("mb-6", className)}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{variant === "destructive" ? "Error" : "Warning"}</AlertTitle>
            <AlertDescription>
                {error}
            </AlertDescription>
        </Alert>
    );
}
