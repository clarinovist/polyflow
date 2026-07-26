import { getOpnameSessions } from './src/actions/inventory/opname';
async function main() {
    const res = await getOpnameSessions();
    console.log(JSON.stringify(res, null, 2));
}
main();
