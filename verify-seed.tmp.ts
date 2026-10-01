import { PrismaClient } from './src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const counts = {
    patients: await prisma.patient.count(),
    providers: await prisma.provider.count(),
    providerServices: await prisma.providerService.count(),
    serviceCosts: await prisma.serviceCost.count(),
    medicalHistories: await prisma.medicalHistory.count(),
    quotes: await prisma.quote.count(),
    quoteItems: await prisma.quoteItem.count(),
    paymentMethods: await prisma.paymentMethod.count(),
    dolares: await prisma.dolar.count(),
    formTemplates: await prisma.formTemplate.count(),
    customFields: await prisma.customField.count(),
    clinics: await prisma.clinic.count(),
    clinicUsers: await prisma.clinicUser.count(),
    users: await prisma.user.count(),
  };
  console.log('COUNTS', counts);

  const quotes = await prisma.quote.findMany({ include: { items: true, patient: true } });
  for (const q of quotes) {
    const sum = q.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
    console.log(`QUOTE | ${q.title} | paciente=${q.patient.name} ${q.patient.lastName} | total=${q.total} | sumaItems=${sum} | status=${q.status} | items=${q.items.length}`);
  }

  const histories = await prisma.medicalHistory.findMany({
    include: { patient: true, template: true },
  });
  for (const h of histories) {
    console.log(`HISTORY | ${h.title} | paciente=${h.patient.name} | template=${h.templateId ?? 'null'} | snapshot=${h.templateSnapshot ? 'si' : 'null'} | dataKeys=${Object.keys(h.data as object).length}`);
  }

  const paymentMethods = await prisma.paymentMethod.findMany();
  for (const p of paymentMethods) {
    console.log(`PAYMENT | ${p.bank} | ${p.account}`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
