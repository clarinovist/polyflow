/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const stockOpnames = await prisma.stockOpname.findMany()
  console.log('Current StockOpnames:', stockOpnames.length)
  
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entityType: 'StockOpname',
    },
    orderBy: { createdAt: 'desc' },
    include: {
        user: true
    }
  })
  console.log(`Found ${auditLogs.length} audit logs for StockOpname`)
  
  for (const log of auditLogs.slice(0, 10)) {
    console.log(`[${log.createdAt}] ${log.user?.email || log.userId} performed ${log.action} on ${log.entityId}`)
  }
}
main().catch(console.error).finally(()=>prisma.$disconnect())
