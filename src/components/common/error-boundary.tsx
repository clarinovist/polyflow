"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-[400px] flex items-center justify-center p-6">
                    <Card className="max-w-md w-full border-red-100 shadow-lg">
                        <CardHeader className="text-center">
                            <div className="mx-auto bg-red-50 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle className="h-6 w-6 text-red-500" />
                            </div>
                            <CardTitle className="text-xl text-red-900">Something went wrong</CardTitle>
                        </CardHeader>
                        <CardContent className="text-center text-muted-foreground text-sm">
                            <p className="mb-4">
                                An unexpected error occurred in this application section.
                            </p>
                            {process.env.NODE_ENV === "development" && (
                                <div className="bg-slate-50 p-3 rounded text-left font-mono text-xs overflow-auto max-h-[150px] border">
                                    {this.state.error?.message}
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="flex justify-center">
                            <Button
                                onClick={() => window.location.reload()}
                                variant="outline"
                                className="gap-2"
                            >
                                <RefreshCcw className="h-4 w-4" />
                                Reload Page
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}
