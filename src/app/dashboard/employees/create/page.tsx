import { EmployeeForm } from '@/components/production/EmployeeForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function CreateEmployeePage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Onboard New Staff</h1>
                <p className="text-muted-foreground mt-1">
                    Fill in the details to register a new production worker.
                </p>
            </div>

            <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl">
                <CardHeader>
                    <CardTitle>Staff Member Information</CardTitle>
                    <CardDescription>All fields are required unless marked otherwise.</CardDescription>
                </CardHeader>
                <CardContent>
                    <EmployeeForm />
                </CardContent>
            </Card>
        </div>
    );
}
