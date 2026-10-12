import pg from 'pg';

const [connectionString, payloadJson] = process.argv.slice(2);
const payload = JSON.parse(payloadJson);
const client = new pg.Client({ connectionString });
await client.connect();
try {
    await client.query('BEGIN');
    await client.query(
        'INSERT INTO "AssistantDurableBinding" ("id", "publicConversationId", "tenantId", "userId", "channel", "accessScopeHash", "workContextKey", "storageKey", "durableConversationId", "storageVersion", "pathname", "profile", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())',
        payload.binding,
    );
    await client.query(
        'INSERT INTO "AssistantDurableSubmission" ("id", "requestId", "questionHash", "publicConversationId", "tenantId", "userId", "channel", "status", "attempts", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,\'pending\',1,NOW(),NOW())',
        payload.submission,
    );
    await client.query('COMMIT');
} catch {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PG_CHILD_SETUP_FAILED');
    process.exit(2);
}
process.stdout.write('PHASE:pg_reserved\n');
setInterval(() => undefined, 60000);
