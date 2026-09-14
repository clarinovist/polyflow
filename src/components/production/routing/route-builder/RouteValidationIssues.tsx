import type { ValidationIssue } from './types';
import { Badge } from '@/components/ui/badge';

type RouteValidationIssuesProps = {
    blockingIssues: ValidationIssue[];
    warningIssues: ValidationIssue[];
};

export function RouteValidationIssues({
    blockingIssues,
    warningIssues,
}: RouteValidationIssuesProps) {
    return (
        <div className="mt-3 space-y-2">
            {blockingIssues.length > 0 && (
                <div>
                    <div className="text-xs font-semibold text-red-700">
                        Blocking ({blockingIssues.length}) — publish dilarang:
                    </div>
                    <div className="space-y-1 mt-1.5">
                        {blockingIssues.map((iss, i) => (
                            <div
                                key={i}
                                className="text-xs p-2.5 rounded bg-red-50 text-red-800 border border-red-200 flex gap-2 items-start"
                            >
                                <span className="font-mono text-[10px] shrink-0 pt-0.5">
                                    {iss.code}
                                </span>
                                <span className="flex-1">{iss.message}</span>
                                {iss.stepCode && (
                                    <Badge
                                        variant="outline"
                                        className="ml-auto text-[10px] shrink-0"
                                    >
                                        {iss.stepCode}
                                    </Badge>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {warningIssues.length > 0 && (
                <div>
                    <div className="text-xs font-semibold text-amber-700">
                        Peringatan ({warningIssues.length}):
                    </div>
                    <div className="space-y-1 mt-1.5">
                        {warningIssues.map((iss, i) => (
                            <div
                                key={i}
                                className="text-xs p-2.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                            >
                                {iss.code}: {iss.message}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {blockingIssues.length === 0 && (
                <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2.5">
                    ✓ Valid — siap publish
                </div>
            )}
        </div>
    );
}
