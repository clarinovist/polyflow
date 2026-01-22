const {PrismaClient} = require('@prisma/client');
(async function(){
  const p = new PrismaClient();
  try {
    const r = await p.$queryRaw`SELECT 1 as v`;
    console.log('ok', r);
  } catch(e){
    console.error('err', e);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
