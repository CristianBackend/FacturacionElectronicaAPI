const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
bcrypt.hash('Admin123!', 12).then(h =>
  p.tenant.updateMany({ data: { passwordHash: h } }).then(r => {
    console.log('Password set for all tenants:', r);
    p["$disconnect"]();
  })
);