/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
prisma.tenant.findMany().then(t => console.log(t)).catch(console.error).finally(()=>prisma.$disconnect())
