'use client';

import { useActionState, useState } from 'react';
import { authenticate } from '@/actions/auth.actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Loader2, Mail, Lock, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import PolyFlowLogo from './polyflow-logo';
import { RoleType } from './role-selection';

interface LoginFormProps {
    selectedRole: RoleType;
    onBack: () => void;
}

export default function LoginForm({ selectedRole, onBack }: LoginFormProps) {
    const [errorMessage, formAction, isPending] = useActionState(
        authenticate,
        undefined,
    );
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="w-full max-w-md mx-auto px-6 sm:px-8 py-8 sm:py-12">
            {/* Back Button */}
            <button
                onClick={onBack}
                className="group flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6 sm:mb-8"
            >
                <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                Back to roles
            </button>

            {/* Logo */}
            <div className="mb-8">
                <PolyFlowLogo variant="dark" size="md" />
            </div>

            {/* Role Badge */}
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4">
                {selectedRole} Workspace
            </div>

            {/* Sign in Header */}
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-6 sm:mb-8">
                Sign in
            </h1>

            <form action={formAction} className="space-y-5">
                {/* Hidden Role field */}
                <input type="hidden" name="role" value={selectedRole} />

                {/* Email Field */}
                <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-foreground">
                        Email Address
                    </Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="Johndoe@gmail.com"
                            required
                            className="pl-10 h-12 bg-background border-input rounded-lg focus:ring-2 focus:ring-ring/10 focus:border-ring transition-all"
                        />
                    </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-foreground">
                        Password
                    </Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            required
                            className="flex h-12 w-full rounded-lg border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/10 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 pl-10 pr-10 transition-all"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            {showPassword ? (
                                <EyeOff className="h-5 w-5" />
                            ) : (
                                <Eye className="h-5 w-5" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center space-x-2">
                    <Checkbox id="remember" name="remember" className="border-input data-[state=checked]:bg-zinc-900 data-[state=checked]:border-zinc-900" />
                    <Label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                        Remember me
                    </Label>
                </div>

                {/* Error Message */}
                {errorMessage && (
                    <div className="flex items-center space-x-2 text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20 animate-in fade-in slide-in-from-top-1">
                        <AlertCircle className="h-5 w-5 flex-shrink-0" />
                        <p className="text-sm font-medium">{errorMessage}</p>
                    </div>
                )}

                {/* Submit Button */}
                <Button
                    type="submit"
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-all duration-200 active:scale-[0.98]"
                    disabled={isPending}
                >
                    {isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        "Sign in"
                    )}
                </Button>
            </form>

            {/* Sign Up & Forgot Password Links */}
            <div className="mt-6 space-y-2 text-sm">
                <p className="text-muted-foreground">
                    Don&apos;t have an account?{' '}
                    <button
                        type="button"
                        onClick={() => toast.info('Coming soon!', { description: 'Registration will be available in a future update.' })}
                        className="text-foreground font-medium hover:underline"
                    >
                        Sign up
                    </button>
                </p>
                <button
                    type="button"
                    onClick={() => toast.info('Coming soon!', { description: 'Password reset will be available in a future update.' })}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                >
                    Forgot Password
                </button>
            </div>
        </div>
    );
}

