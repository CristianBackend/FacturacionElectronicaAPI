import { PrismaClient, Plan, ApiKeyScope, EcfType, DgiiEnvironment } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create a demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { email: 'demo@ecf-api.com' },
    update: {},
    create: {
      name: 'Demo Tenant',
      email: 'demo@ecf-api.com',
      plan: Plan.BUSINESS,
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Create API keys
  const testKeyRaw = 'frd_test_0000000000000000000000000000000000000000demo1234';
  const testKeyHash = await bcrypt.hash(testKeyRaw, 12);

  const testKey = await prisma.apiKey.upsert({
    where: { keyHash: testKeyHash },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Development Test Key',
      keyHash: testKeyHash,
      keyPrefix: 'frd_test_00000000',
      scopes: [ApiKeyScope.FULL_ACCESS],
      isLive: false,
    },
  });

  console.log(`✅ Test API Key: ${testKeyRaw}`);

  // 3. Create a demo company
  const company = await prisma.company.upsert({
    where: {
      tenantId_rnc: {
        tenantId: tenant.id,
        rnc: '130000001',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      rnc: '130000001',
      businessName: 'Empresa Demo SRL',
      tradeName: 'Demo',
      address: 'Calle Principal #1, Santo Domingo',
      phone: '809-555-0100',
      email: 'facturacion@demo.com',
      municipality: 'Distrito Nacional',
      province: 'Santo Domingo',
      dgiiEnv: DgiiEnvironment.DEV,
    },
  });
  console.log(`✅ Company: ${company.businessName} (RNC: ${company.rnc})`);

  // 4. Create demo sequences (simulating DGII TesteCF auto-sequences)
  const ecfTypes: { type: EcfType; prefix: string; max: number }[] = [
    { type: EcfType.E31, prefix: 'E31', max: 10000000 },
    { type: EcfType.E32, prefix: 'E32', max: 50000000 },
    { type: EcfType.E33, prefix: 'E33', max: 10000000 },
    { type: EcfType.E34, prefix: 'E34', max: 10000000 },
  ];

  for (const ecf of ecfTypes) {
    await prisma.sequence.upsert({
      where: {
        companyId_ecfType_isActive: {
          companyId: company.id,
          ecfType: ecf.type,
          isActive: true,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        companyId: company.id,
        ecfType: ecf.type,
        prefix: ecf.prefix,
        startNumber: 1,
        currentNumber: 0,
        endNumber: ecf.max,
        isActive: true,
      },
    });
    console.log(`✅ Sequence: ${ecf.prefix} [1 - ${ecf.max.toLocaleString()}]`);
  }

  console.log('\n🎉 Seed completed!');
  console.log('\n📋 Quick start:');
  console.log(`   API Key (test): ${testKeyRaw}`);
  console.log(`   Tenant ID: ${tenant.id}`);
  console.log(`   Company ID: ${company.id}`);
  console.log(`   RNC: ${company.rnc}`);
  console.log('\n   curl -H "Authorization: Bearer ${testKeyRaw}" http://localhost:3000/api/v1/health');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
