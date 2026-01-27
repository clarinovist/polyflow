import { COAAuditTool } from "@/components/finance/COAAuditTool";

export default function CoaPage() {
    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Chart of Accounts</h1>
                <p className="text-muted-foreground">Manage your organizational account structure and ensure accounting integrity.</p>
            </div>

            <COAAuditTool />

            <div className="border rounded-lg p-12 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-900/50 border-dashed">
                <p className="text-sm text-muted-foreground italic">Full account management (CRUD) is currently under development.</p>
                <p className="text-xs text-muted-foreground mt-1">Use the integrity check above to ensure core accounts are initialized.</p>
            </div>
        </div>
    );
}
