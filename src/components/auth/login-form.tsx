'use client';

import { useActionState, useState } from 'react';
import { authenticate } from '@/actions/auth.actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Loader2, Mail, Lock, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import PolyFlowLogo from './polyflow-logo';
import { RoleType } from './role-selection';

interface LoginFormProps {
    selectedRole: RoleType;
    onBack: () => void;
}

export default function LoginForm({ selectedRole, onBack }: LoginFormProps) {
    const t = useTranslations('auth.login');
    const tr = useTranslations('auth.roles');
    const [errorMessage, formAction, isPending] = useActionState(
        authenticate,
        undefined,
    );
    const [showPassword, setShowPassword] = useState(false);

    const handleGoogleLogin = () => {
        toast.info('Coming soon!', {
            description: 'Google login will be available in a future update.',
        });
    };

    return (
        <div className="w-full max-w-md mx-auto px-6 sm:px-8 py-8 sm:py-12">
            {/* Back Button */}
            <button
                onClick={onBack}
                className="group flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6 sm:mb-8"
            >
                <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                {t('backToRoles')}
            </button>

            {/* Logo */}
            <div className="mb-8">
                <PolyFlowLogo variant="dark" size="md" />
            </div>

            {/* Role Badge */}
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4">
                {tr(`${selectedRole}.title`)} Workspace
            </div>

            {/* Sign in Header */}
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-6 sm:mb-8">
                {t('signIn')}
            </h1>

            <form action={formAction} className="space-y-5">
                {/* Hidden Role field */}
                <input type="hidden" name="role" value={selectedRole} />

                {/* Email Field */}
                <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-foreground">
                        {t('emailLabel')}
                    </Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder={t('emailPlaceholder')}
                            required
                            className="pl-10 h-12 bg-background border-input rounded-lg focus:ring-2 focus:ring-ring/10 focus:border-ring transition-all"
                        />
                    </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-foreground">
                        {t('passwordLabel')}
                    </Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder={t('passwordPlaceholder')}
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
                        {t('rememberMe')}
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
                        t('signIn')
                    )}
                </Button>
            </form>

            {/* Sign Up & Forgot Password Links */}
            <div className="mt-6 space-y-2 text-sm">
                <p className="text-muted-foreground">
                    {t('noAccount')}{' '}
                    <button
                        type="button"
                        onClick={() => toast.info('Coming soon!', { description: 'Registration will be available in a future update.' })}
                        className="text-foreground font-medium hover:underline"
                    >
                        {t('signUp')}
                    </button>
                </p>
                <button
                    type="button"
                    onClick={() => toast.info('Coming soon!', { description: 'Password reset will be available in a future update.' })}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                >
                    {t('forgotPassword')}
                </button>
            </div>

            {/* Social Login */}
            <div className="mt-8">
                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="flex items-center justify-center w-12 h-12 rounded-full border border-border hover:border-ring hover:bg-muted transition-all duration-200"
                    aria-label={t('socialLogin')}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}

