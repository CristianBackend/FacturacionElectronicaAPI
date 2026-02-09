const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
  const tenants = await p.tenant.findMany({ select: { email: true, passwordHash: true } });
  tenants.forEach(t => console.log(t.email, '| has password:', !!t.passwordHash));
  await p["$disconnect"]();
}
check();