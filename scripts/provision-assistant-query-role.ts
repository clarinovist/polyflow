import { Client } from 'pg';
import {
    buildAssistantQueryRolePlan,
    buildAssistantQueryRoleVerificationSql,
} from '../src/lib/ops/assistant-query-role';

/**
 * Provision (or re-verify) the least-privilege assistant query role.
 *
 * Safety:
 * - prints statements by default; `--apply` is required to execute
 * - refuses a non-loopback admin DSN unless `--allow-remote` is passed
 * - never prints a DSN, password, or URL
 */

type Options = {
    apply: boolean;
    allowRemote: boolean;
    role: string;
    database: string;
    schema: string;
};

function parseArgs(argv: readonly string[]): Options {
    const options: Options = {
        apply: false,
        allowRemote: false,
        role: 'assistant_query',
        database: '',
        schema: 'public',
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = () => {
            const value = argv[index + 1];
            if (!value) throw new Error(`MISSING_VALUE_${arg}`);
            index += 1;
            return value;
        };
        if (arg === '--apply') options.apply = true;
        else if (arg === '--allow-remote') options.allowRemote = true;
        else if (arg === '--role') options.role = next();
        else if (arg === '--database') options.database = next();
        else if (arg === '--schema') options.schema = next();
        else throw new Error(`UNKNOWN_ARG_${arg}`);
    }
    if (!options.database) throw new Error('MISSING_DATABASE');
    return options;
}

function assertAdminConnection(raw: string, allowRemote: boolean): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('ASSISTANT_QUERY_ADMIN_URL_INVALID');
    }
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        throw new Error('ASSISTANT_QUERY_ADMIN_URL_INVALID');
    }
    const loopback =
        url.hostname === '127.0.0.1' ||
        url.hostname === 'localhost' ||
        url.hostname === '::1';
    if (!loopback && !allowRemote) {
        throw new Error('ASSISTANT_QUERY_ADMIN_URL_MUST_BE_LOOPBACK');
    }
    return url;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const plan = buildAssistantQueryRolePlan({
        role: options.role,
        database: options.database,
        schema: options.schema,
    });

    console.log('=== Assistant query role plan ===');
    console.log(
        `role=${plan.role} database=${plan.database} schema=${plan.schema}`,
    );
    for (const statement of plan.statements) console.log(`${statement}\n`);

    if (!options.apply) {
        console.log('Dry run only. Re-run with --apply to execute.');
        return;
    }

    const adminUrl = process.env.ASSISTANT_QUERY_ADMIN_URL;
    if (!adminUrl) throw new Error('ASSISTANT_QUERY_ADMIN_URL_REQUIRED');
    assertAdminConnection(adminUrl, options.allowRemote);

    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
        await client.query('BEGIN');
        for (const statement of plan.statements) await client.query(statement);
        await client.query('COMMIT');
        const verification = await client.query(
            buildAssistantQueryRoleVerificationSql({ role: plan.role }),
        );
        console.log('=== Verification ===');
        console.log(JSON.stringify(verification.rows, null, 2));
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error(
            '[ASSISTANT_QUERY_ROLE_FAILED]',
            error instanceof Error ? error.message : 'unknown',
        );
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main().catch((error: unknown) => {
    console.error(
        '[ASSISTANT_QUERY_ROLE_FAILED]',
        error instanceof Error ? error.message : 'unknown',
    );
    process.exitCode = 1;
});
