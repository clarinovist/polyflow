'use client';

import { useActionState } from 'react';
import { authenticate } from '@/actions/auth.actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginForm() {
    const [errorMessage, formAction, isPending] = useActionState(
        authenticate,
        undefined,
    );

    return (
        <Card className="w-full max-w-md shadow-2xl border-none bg-white/80 backdrop-blur-md">
            <CardHeader className="space-y-1">
                <CardTitle className="text-3xl font-bold tracking-tight text-center bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    PolyFlow
                </CardTitle>
                <CardDescription className="text-center text-gray-500">
                    Enter your credentials to access the ERP
                </CardDescription>
            </CardHeader>
            <form action={formAction}>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="name@company.com"
                            required
                            className="bg-gray-50 border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            required
                            className="bg-gray-50 border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                    </div>

                    {errorMessage && (
                        <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 animate-in fade-in slide-in-from-top-1">
                            <AlertCircle className="h-5 w-5" />
                            <p className="text-sm font-medium">{errorMessage}</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="pt-6">
                    <Button
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-6 rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/25 active:scale-[0.98]"
                        disabled={isPending}
                    >
                        {isPending ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <div className="flex items-center justify-center">
                                Log In <ArrowRight className="ml-2 h-4 w-4" />
                            </div>
                        )}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
