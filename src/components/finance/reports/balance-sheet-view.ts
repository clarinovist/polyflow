export interface BalanceSheetAccount {
    id: string;
    code: string;
    name: string;
    netBalance: number;
    parentId: string | null;
}

export interface BalanceSheetRow {
    kind: 'group' | 'account';
    account: BalanceSheetAccount;
    amount: number | null;
    depth: number;
    expandable: boolean;
    directBalance?: boolean;
}

interface AccountNode {
    account: BalanceSheetAccount;
    children: AccountNode[];
}

const hasBalance = (amount: number) => Math.abs(amount) > 0.01;

export function filterBalanceSheetAccounts(
    accounts: BalanceSheetAccount[],
    query: string,
): BalanceSheetAccount[] {
    const normalized = query.trim().toLocaleLowerCase('id-ID');
    if (!normalized) return accounts;

    return accounts.filter(
        (account) =>
            account.code.toLocaleLowerCase('id-ID').includes(normalized) ||
            account.name.toLocaleLowerCase('id-ID').includes(normalized),
    );
}

function buildForest(accounts: BalanceSheetAccount[]): AccountNode[] {
    const nodes = new Map(
        accounts.map((account) => [
            account.id,
            { account, children: [] as AccountNode[] },
        ]),
    );
    const roots: AccountNode[] = [];

    for (const account of accounts) {
        const node = nodes.get(account.id)!;
        const parent = account.parentId ? nodes.get(account.parentId) : undefined;
        if (parent && parent !== node) parent.children.push(node);
        else roots.push(node);
    }

    return roots;
}

export function buildAccountRows(
    accounts: BalanceSheetAccount[],
    expandedIds: ReadonlySet<string>,
    hideZero: boolean,
): BalanceSheetRow[] {
    const rows: BalanceSheetRow[] = [];
    const visiting = new Set<string>();

    const subtree = (node: AccountNode): { total: number; hasNonZero: boolean } => {
        if (visiting.has(node.account.id)) {
            return {
                total: node.account.netBalance,
                hasNonZero: hasBalance(node.account.netBalance),
            };
        }
        visiting.add(node.account.id);
        let total = node.account.netBalance;
        let hasNonZero = hasBalance(node.account.netBalance);
        for (const child of node.children) {
            const childResult = subtree(child);
            total += childResult.total;
            hasNonZero ||= childResult.hasNonZero;
        }
        visiting.delete(node.account.id);
        return { total, hasNonZero };
    };

    const append = (node: AccountNode, depth: number) => {
        const aggregate = subtree(node);
        if (hideZero && !aggregate.hasNonZero) return;

        if (node.children.length === 0) {
            rows.push({
                kind: 'account',
                account: node.account,
                amount: node.account.netBalance,
                depth,
                expandable: false,
            });
            return;
        }

        const expanded = expandedIds.has(node.account.id);
        rows.push({
            kind: 'group',
            account: node.account,
            amount: expanded ? null : aggregate.total,
            depth,
            expandable: true,
        });
        if (!expanded) return;

        if (!hideZero || hasBalance(node.account.netBalance)) {
            rows.push({
                kind: 'account',
                account: node.account,
                amount: node.account.netBalance,
                depth: depth + 1,
                expandable: false,
                directBalance: true,
            });
        }
        for (const child of node.children) append(child, depth + 1);
    };

    for (const root of buildForest(accounts)) append(root, 0);
    return rows;
}
