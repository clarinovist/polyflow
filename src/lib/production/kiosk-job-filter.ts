/** 'all', 'manual' (SPKs without a machine) or one machine id. */
export type KioskMachineFilter = string;

interface FilterableJob {
    orderNumber: string;
    productName: string;
    machine: { id: string } | null;
}

interface KioskJobFilter {
    query: string;
    machine: KioskMachineFilter;
    /** Machines assigned to the operator; empty means no assignment. */
    operatorMachineIds: readonly string[];
}

/**
 * SPKs an operator should see. Manual SPKs (no machine, e.g. baling) stay
 * visible to every operator, as before.
 */
export function filterKioskJobs<T extends FilterableJob>(
    jobs: readonly T[],
    { query, machine, operatorMachineIds }: KioskJobFilter,
): T[] {
    const needle = query.trim().toLowerCase();
    return jobs.filter((job) => {
        if (
            operatorMachineIds.length > 0 &&
            job.machine &&
            !operatorMachineIds.includes(job.machine.id)
        )
            return false;
        if (machine === 'manual' && job.machine) return false;
        if (
            machine !== 'all' &&
            machine !== 'manual' &&
            job.machine?.id !== machine
        )
            return false;
        return (
            !needle ||
            job.orderNumber.toLowerCase().includes(needle) ||
            job.productName.toLowerCase().includes(needle)
        );
    });
}
