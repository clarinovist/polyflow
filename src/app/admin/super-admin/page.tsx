import { auth } from "@/auth";
import { prisma } from "@/lib/core/prisma";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { SuperAdminClient } from "./client";

export default async function SuperAdminPage() {
    const session = await auth();

    if (!session?.user || session.user.role !== Role.ADMIN) {
        redirect("/dashboard");
    }

    // Since this runs in the "main" request (not a tenant subdomain),
    // we can safely pull the tenants from the main database.
    const tenants = await prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
    });

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Super Admin Dashboard</h1>
                <p className="text-muted-foreground mt-1">
                    Manage system tenants and databases.
                </p>
            </div>

            <SuperAdminClient initialTenants={tenants} />
        </div>
    );
}
