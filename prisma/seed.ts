import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no esta definida: define la conexion en .env antes de ejecutar el seed.');
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Contadores para saber en cada run que se creo y que ya existia (seed idempotente).
let created = 0;
let skipped = 0;

function tally(wasCreated: boolean) {
  if (wasCreated) created++;
  else skipped++;
}

async function main() {
  console.log('🌱 Starting seed...');

  // Create users
  const hashedPassword = await bcrypt.hash('password123', 10);

  const doctor = await prisma.user.upsert({
    where: { email: 'doctor@medclinical.com' },
    update: {},
    create: {
      email: 'doctor@medclinical.com',
      password: hashedPassword,
      name: 'Juan',
      lastName: 'Pérez',
      role: 'DOCTOR',
      isActive: true,
    },
  });

  const assistant = await prisma.user.upsert({
    where: { email: 'assistant@medclinical.com' },
    update: {},
    create: {
      email: 'assistant@medclinical.com',
      password: hashedPassword,
      name: 'María',
      lastName: 'López',
      role: 'ASSISTANT',
      isActive: true,
    },
  });

  console.log(`✅ Created users: ${doctor.name} ${doctor.lastName} (${doctor.role}) and ${assistant.name} ${assistant.lastName} (${assistant.role})`);

  // El consultorio es el tenant: la doctora y su asistente son miembros del MISMO
  // consultorio, por eso comparten pacientes. Un mismo usuario puede ser miembro
  // de varios consultorios (findOrCreate de abajo mas el helper de membresia).
  const clinic = await prisma.clinic.upsert({
    where: { slug: 'consultorio-principal' },
    update: {},
    create: {
      name: 'Consultorio Principal',
      slug: 'consultorio-principal',
      isActive: true,
    },
  });

  await prisma.clinicUser.upsert({
    where: { clinicId_userId: { clinicId: clinic.id, userId: doctor.id } },
    update: { role: 'DOCTOR', isActive: true },
    create: { clinicId: clinic.id, userId: doctor.id, role: 'DOCTOR', isActive: true },
  });

  await prisma.clinicUser.upsert({
    where: { clinicId_userId: { clinicId: clinic.id, userId: assistant.id } },
    update: { role: 'ASSISTANT', isActive: true },
    create: { clinicId: clinic.id, userId: assistant.id, role: 'ASSISTANT', isActive: true },
  });

  console.log(`✅ Clinic "${clinic.name}" con 2 miembros (doctora + asistente, comparten pacientes)`);

  // Create 10 patients
  const patientsData = [
    { name: 'Ana', lastName: 'García', identify: 'ANA001', email: 'ana.garcia@email.com', phone: '+1234567890', birthDate: new Date('1985-03-15'), gender: 'Femenino', address: 'Calle Principal 123, Ciudad' },
    { name: 'Carlos', lastName: 'López', identify: 'CAR002', email: 'carlos.lopez@email.com', phone: '+1234567891', birthDate: new Date('1978-07-22'), gender: 'Masculino', address: 'Avenida Central 456, Ciudad' },
    { name: 'María', lastName: 'Rodríguez', identify: 'MAR003', email: 'maria.rodriguez@email.com', phone: '+1234567892', birthDate: new Date('1992-11-08'), gender: 'Femenino', address: 'Plaza Mayor 789, Ciudad' },
    { name: 'Pedro', lastName: 'Martínez', identify: 'PED004', email: 'pedro.martinez@email.com', phone: '+1234567893', birthDate: new Date('1980-05-30'), gender: 'Masculino', address: 'Callejón Norte 321, Ciudad' },
    { name: 'Laura', lastName: 'Fernández', identify: 'LAU005', email: 'laura.fernandez@email.com', phone: '+1234567894', birthDate: new Date('1988-09-12'), gender: 'Femenino', address: 'Boulevard Este 654, Ciudad' },
    { name: 'Miguel', lastName: 'Torres', identify: 'MIG006', email: 'miguel.torres@email.com', phone: '+1234567895', birthDate: new Date('1975-01-25'), gender: 'Masculino', address: 'Avenida Oeste 987, Ciudad' },
    { name: 'Sofía', lastName: 'Jiménez', identify: 'SOF007', email: 'sofia.jimenez@email.com', phone: '+1234567896', birthDate: new Date('1995-06-18'), gender: 'Femenino', address: 'Calle Sur 147, Ciudad' },
    { name: 'Javier', lastName: 'Díaz', identify: 'JAV008', email: 'javier.diaz@email.com', phone: '+1234567897', birthDate: new Date('1982-12-03'), gender: 'Masculino', address: 'Plaza Norte 258, Ciudad' },
    { name: 'Isabel', lastName: 'Ruiz', identify: 'ISI009', email: 'isabel.ruiz@email.com', phone: '+1234567898', birthDate: new Date('1990-04-07'), gender: 'Femenino', address: 'Pasaje Central 369, Ciudad' },
    { name: 'Roberto', lastName: 'Sánchez', identify: 'ROB010', email: 'roberto.sanchez@email.com', phone: '+1234567899', birthDate: new Date('1973-08-14'), gender: 'Masculino', address: 'Avenida Sur 741, Ciudad' },
  ];

  // Patient.identify NO es unico en el schema (solo hay indice), asi que la guarda
  // de idempotencia es findFirst por clinicId + identify, no upsert.
  const patients: ((typeof patientsData)[number] & { id: string })[] = [];
  let patientsCreated = 0;
  for (const patient of patientsData) {
    const existing = await prisma.patient.findFirst({
      where: { clinicId: clinic.id, identify: patient.identify },
    });
    if (existing) {
      patients.push({ ...patient, id: existing.id });
      tally(false);
      continue;
    }
    const createdPatient = await prisma.patient.create({
      data: { ...patient, clinicId: clinic.id, isActive: true },
    });
    patients.push({ ...patient, id: createdPatient.id });
    tally(true);
    patientsCreated++;
  }

  console.log(`✅ Patients: ${patients.length} (${patientsCreated} nuevos, ${patients.length - patientsCreated} ya existian)`);

  // Create 15 providers with 5 services each
  const providersData = [
    { name: 'Laboratorio', type: 'Laboratorio', businessName: 'Laboratorio ACH', identify: 'LAB001' },
    { name: 'Farmacia', type: 'Farmacia', businessName: 'Farmacia ACH', identify: 'FAR002' },
    { name: 'Clínica', type: 'Clínica', businessName: 'Clínica ACH', identify: 'CLI003' },
    { name: 'Equipamiento', type: 'Equipamiento', businessName: 'Equipamiento ACH', identify: 'EQU004' },
    { name: 'Odontología', type: 'Odontología', businessName: 'Odontología ACH', identify: 'ODO005' },
    { name: 'Optometría', type: 'Optometría', businessName: 'Optometría ACH', identify: 'OPT006' },
    { name: 'Nutrición', type: 'Nutrición', businessName: 'Nutrición ACH', identify: 'NUT007' },
    { name: 'Fisioterapia', type: 'Fisioterapia', businessName: 'Fisioterapia ACH', identify: 'FIS008' },
    { name: 'Psicología', type: 'Psicología', businessName: 'Psicología ACH', identify: 'PSI009' },
    { name: 'Cardiología', type: 'Cardiología', businessName: 'Cardiología ACH', identify: 'CAR010' },
    { name: 'Radiología', type: 'Radiología', businessName: 'Radiología ACH', identify: 'RAD011' },
    { name: 'Cirugía', type: 'Cirugía', businessName: 'Cirugía ACH', identify: 'CIR012' },
    { name: 'Anestesia', type: 'Anestesia', businessName: 'Anestesia ACH', identify: 'ANE013' },
    { name: 'Imagen', type: 'Imagen', businessName: 'Imagen ACH', identify: 'IMG014' },
    { name: 'Transportación', type: 'Transportación', businessName: 'Transportación ACH', identify: 'TRA015' },
  ];

  const servicesData = [
    ['Análisis de Sangre', 'Biometría Hemática', 'Perfil Químico', 'Panel Lipídico', 'Prueba de Glucosa'],
    ['Medicamentos Genéricos', 'Medicamentos de Marca', 'Vacunas', 'Insumos Médicos', 'Curaciones'],
    ['Consulta General', 'Revisión Médica', 'Chequeo Ejecutivo', 'Atención Domiciliaria', 'Telemedicina'],
    ['Equipos de Rayos X', 'Ecógrafos', 'Batas Quirúrgicas', 'Guantes Estériles', 'Mascarillas'],
    ['Limpieza Dental', 'Ortodoncia', 'Blanqueamiento', 'Selladores', 'Endodoncia'],
    ['Examen de Vista', 'Lentes de Contacto', 'Armazones', 'Tratamiento Óptico', 'Cirugía LASIK'],
    ['Plan Nutricional', 'Consulta Nutricional', 'Suplementos', 'Evaluación Metabólica', 'Seguimiento'],
    ['Terapia Física', 'Rehabilitación', 'Masajes', 'Ejercicios', 'Ultrasonido'],
    ['Terapia Individual', 'Terapia de Pareja', 'Terapia Familiar', 'Evaluación Psicológica', 'Tratamiento'],
    ['Electrocardiograma', 'Prueba de Esfuerzo', 'Holter', 'Ecocardiograma', 'Cateterismo'],
    ['Resonancia Magnética', 'Tomografía', 'Ultrasonido', 'Mamografía', 'Rayos X'],
    ['Cirugía General', 'Cirugía Ambulatoria', 'Procedimientos', 'Cirugía Estética', 'Cirugía Laparoscópica'],
    ['Anestesia Local', 'Anestesia General', 'Sedación', 'Bloqueo Nervioso', 'Analgesia'],
    ['Resonancia', 'Tac', 'Ultrasonido 4D', 'Densitometría', 'Gammagrafía'],
    ['Ambulancia', 'Traslado Local', 'Traslado Nacional', 'Traslado Internacional', 'Servicio de Emergencia'],
  ];

  const beforeProviders = created;
  let serviceCount = 0;
  for (let i = 0; i < providersData.length; i++) {
    // Provider.identify tampoco es unico: guarda por clinicId + identify.
    let provider = await prisma.provider.findFirst({
      where: { clinicId: clinic.id, identify: providersData[i].identify },
    });
    if (provider) {
      tally(false);
    } else {
      provider = await prisma.provider.create({
        data: {
          name: providersData[i].name,
          type: providersData[i].type,
          businessName: providersData[i].businessName,
          identify: providersData[i].identify,
          email: `contacto${i + 1}@proveedor.com`,
          phone: `+52${String(i).padStart(10, '0')}`,
          address: `Dirección ${providersData[i].name} #${i + 1}`,
          description: `Proveedor de ${providersData[i].type}`,
          clinicId: clinic.id,
          isActive: true,
        },
      });
      tally(true);
    }

    for (const serviceName of servicesData[i]) {
      const existingService = await prisma.providerService.findFirst({
        where: { providerId: provider.id, name: serviceName },
      });
      if (existingService) {
        tally(false);
      } else {
        await prisma.providerService.create({
          data: {
            name: serviceName,
            description: `Servicio de ${serviceName}`,
            price: Math.floor(Math.random() * 5000) + 500,
            providerId: provider.id,
            isActive: true,
          },
        });
        tally(true);
      }
      serviceCount++;
    }
  }

  console.log(`✅ Providers: ${providersData.length} con ${serviceCount} servicios (${created - beforeProviders} filas nuevas en esta seccion)`);

  // Create service costs
  const costsData = [
    { name: 'Consulta Médica', description: 'Consulta general con el médico', price: 500 },
    { name: 'Consulta de Seguimiento', description: 'Revisión post-consulta', price: 250 },
    { name: 'Chequeo Médico', description: 'Examen médico completo', price: 800 },
    { name: 'Certificado Médico', description: 'Emitir certificado de salud', price: 300 },
    { name: 'Vacunación', description: 'Aplicación de vacunas', price: 450 },
    { name: 'Curación Simple', description: 'Curación de heridas menores', price: 200 },
    { name: 'Curación Compleja', description: 'Curación de heridas grandes', price: 500 },
    { name: 'Procedimiento Menor', description: 'Procedimientos menores', price: 600 },
  ];

  let costCount = 0;
  for (const cost of costsData) {
    const existingCost = await prisma.serviceCost.findFirst({
      where: { clinicId: clinic.id, name: cost.name },
    });
    if (existingCost) {
      tally(false);
    } else {
      await prisma.serviceCost.create({
        data: { ...cost, clinicId: clinic.id },
      });
      tally(true);
    }
    costCount++;
  }

  console.log(`✅ Service costs: ${costCount}`);

  // Plantilla de ejemplo para que el constructor de formularios no arranque vacio
  // (FormTemplate tiene @@unique([clinicId, name]), asi que findFirst es suficiente).
  let template = await prisma.formTemplate.findFirst({
    where: { clinicId: clinic.id, name: 'Control de hipertensión' },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!template) {
    template = await prisma.formTemplate.create({
      data: {
        name: 'Control de hipertensión',
        condition: 'Hipertensión',
        description: 'Seguimiento de presión arterial y tratamiento',
        type: 'control',
        clinicId: clinic.id,
        isActive: true,
        fields: {
          create: [
            { name: 'Presión arterial sistólica', fieldType: 'number', unit: 'mmHg', isRequired: true, sortOrder: 1, step: 1, helpText: 'Ej: 120', options: [] },
            { name: 'Presión arterial diastólica', fieldType: 'number', unit: 'mmHg', isRequired: true, sortOrder: 2, step: 1, helpText: 'Ej: 80', options: [] },
            { name: 'Peso', fieldType: 'number', unit: 'kg', isRequired: false, sortOrder: 3, step: 1, minValue: 20, maxValue: 300, options: [] },
            { name: 'Cumple con el tratamiento', fieldType: 'radio', options: ['Sí', 'No', 'Parcialmente'], isRequired: true, sortOrder: 1, step: 2 },
            { name: 'Síntomas', fieldType: 'checkbox', options: ['Dolor de cabeza', 'Mareo', 'Edema', 'Ninguno'], isRequired: false, sortOrder: 2, step: 2 },
          ],
        },
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    tally(true);
    console.log(`✅ Created 1 form template "${template.name}" with ${template.fields.length} fields`);
  } else {
    tally(false);
    console.log(`✅ Form template "${template.name}" ya existia con ${template.fields.length} fields`);
  }

  // Tasa del dolar: GLOBAL a proposito (no tiene clinicId). Solo se siembra si la
  // tabla esta vacia; despues de eso el historial es append-only y lo alimenta
  // GET /services-costs/dolar/save.
  let dolar = await prisma.dolar.findFirst({ orderBy: { date: 'desc' } });
  if (!dolar) {
    dolar = await prisma.dolar.create({
      data: { value: 36.5, date: new Date() },
    });
    tally(true);
    console.log(`✅ Created dolar rate ${dolar.value}`);
  } else {
    tally(false);
    console.log(`✅ Dolar rate already exists (${dolar.value})`);
  }

  // Metodos de pago: los dos bancos con los que trabaja el consultorio.
  const paymentMethodsData = [
    { bank: 'Banesco', identify: '0134-0123-4567-8901', phone: '+582125550101', email: 'pagos@consultorio-principal.com', account: 'Ahorros 0134012345678901' },
    { bank: 'Mercantil', identify: '0105-0987-6543-2109', phone: '+582125550102', email: 'pagos@consultorio-principal.com', account: 'Corriente 0105098765432109' },
  ];

  for (const method of paymentMethodsData) {
    const existingMethod = await prisma.paymentMethod.findFirst({
      where: { clinicId: clinic.id, bank: method.bank },
    });
    if (existingMethod) {
      tally(false);
    } else {
      await prisma.paymentMethod.create({
        data: { ...method, clinicId: clinic.id, isActive: true },
      });
      tally(true);
    }
  }

  console.log(`✅ Payment methods: ${paymentMethodsData.length}`);

  // Historias medicas de ejemplo. Las dos primeras van ligadas a la plantilla de
  // hipertension con templateSnapshot (copia de la definicion en el momento del
  // guardado), para que la historia siga siendo legible si la plantilla cambia.
  const templateSnapshot = {
    id: template.id,
    name: template.name,
    condition: template.condition,
    type: template.type,
    fields: template.fields.map(f => ({
      name: f.name,
      fieldType: f.fieldType,
      isRequired: f.isRequired,
      options: f.options,
      sortOrder: f.sortOrder,
      step: f.step,
      unit: f.unit,
      helpText: f.helpText,
      minValue: f.minValue,
      maxValue: f.maxValue,
    })),
  };

  const ana = patients.find(p => p.identify === 'ANA001')!;
  const carlos = patients.find(p => p.identify === 'CAR002')!;
  const maria = patients.find(p => p.identify === 'MAR003')!;

  const historiesData = [
    {
      title: 'Control de hipertensión - primer control',
      type: 'control',
      patientId: ana.id,
      templateId: template.id,
      templateSnapshot,
      notes: 'Paciente acude por primera vez al programa de control. Se ajusta dosis de losartán.',
      data: {
        'Presión arterial sistólica': 148,
        'Presión arterial diastólica': 94,
        'Peso': 78.5,
        'Cumple con el tratamiento': 'Parcialmente',
        'Síntomas': ['Dolor de cabeza'],
      },
    },
    {
      title: 'Control de hipertensión - seguimiento mensual',
      type: 'control',
      patientId: ana.id,
      templateId: template.id,
      templateSnapshot,
      notes: 'Buena adherencia tras el cambio de tratamiento. Sin edema.',
      data: {
        'Presión arterial sistólica': 126,
        'Presión arterial diastólica': 82,
        'Peso': 77.2,
        'Cumple con el tratamiento': 'Sí',
        'Síntomas': ['Ninguno'],
      },
    },
    {
      title: 'Primera consulta - dolor lumbar',
      type: 'consulta',
      patientId: carlos.id,
      templateId: null,
      templateSnapshot: null,
      notes: 'Dolor lumbar de 3 semanas de evolución, sin irradiación. Se indica imagenología.',
      data: {
        motivoConsulta: 'Dolor lumbar de 3 semanas',
        antecedentes: 'Ninguno relevante',
        medicacionActual: 'Ibuprofeno 400 mg cada 12 h',
      },
    },
    {
      title: 'Evaluación nutricional inicial',
      type: 'consulta',
      patientId: maria.id,
      templateId: null,
      templateSnapshot: null,
      notes: 'Paciente busca control de peso. Se establece plan de 1200 kcal.',
      data: {
        motivoConsulta: 'Control de peso',
        pesoActual: 68,
        estatura: 1.62,
        observaciones: 'Sedentaria, sin alergias alimentarias',
      },
    },
  ];

  let historyCount = 0;
  for (const history of historiesData) {
    const existingHistory = await prisma.medicalHistory.findFirst({
      where: { patientId: history.patientId, clinicId: clinic.id, title: history.title },
    });
    if (existingHistory) {
      tally(false);
    } else {
      const { templateSnapshot, ...rest } = history;
      await prisma.medicalHistory.create({
        data: {
          ...rest,
          // Columna Json: null literal no es aceptado por Prisma, hay que usar DbNull.
          templateSnapshot: templateSnapshot ?? Prisma.DbNull,
          clinicId: clinic.id,
          createdById: doctor.id,
        },
      });
      tally(true);
    }
    historyCount++;
  }

  console.log(`✅ Medical histories: ${historyCount}`);

  // Presupuestos de ejemplo. Quote.total lo calcula el cliente en produccion
  // (el servidor no lo recalcula), aqui se suma para mantener consistencia con
  // los items. dolarId referencia la tasa vigente al momento de emitir.
  const quotesData = [
    {
      title: 'Presupuesto control de hipertensión - Ana García',
      description: 'Consultas de control y estudios de laboratorio del primer trimestre.',
      status: 'pending',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      patientId: ana.id,
      items: [
        { name: 'Consulta Médica', description: 'Consulta general con el médico', quantity: 2, unitPrice: 500 },
        { name: 'Perfil Químico', description: 'Laboratorio ACH', quantity: 1, unitPrice: 850 },
        { name: 'Panel Lipídico', description: 'Laboratorio ACH', quantity: 1, unitPrice: 620 },
      ],
    },
    {
      title: 'Presupuesto dolor lumbar - Carlos López',
      description: 'Estudio de imagen y sesiones de fisioterapia.',
      status: 'approved',
      validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      patientId: carlos.id,
      items: [
        { name: 'Rayos X', description: 'Radiología ACH', quantity: 2, unitPrice: 450 },
        { name: 'Terapia Física', description: 'Fisioterapia ACH', quantity: 6, unitPrice: 300 },
      ],
    },
  ];

  let quoteCount = 0;
  for (const quote of quotesData) {
    const existingQuote = await prisma.quote.findFirst({
      where: { clinicId: clinic.id, title: quote.title },
    });
    if (existingQuote) {
      tally(false);
    } else {
      const total = quote.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      await prisma.quote.create({
        data: {
          title: quote.title,
          description: quote.description,
          status: quote.status,
          validUntil: quote.validUntil,
          total,
          dolarId: dolar.id,
          patientId: quote.patientId,
          clinicId: clinic.id,
          createdById: doctor.id,
          items: {
            create: quote.items.map(item => ({
              ...item,
              total: item.unitPrice * item.quantity,
            })),
          },
        },
      });
      tally(true);
    }
    quoteCount++;
  }

  console.log(`✅ Quotes: ${quoteCount} (con sus QuoteItem)`);

  console.log(`🎉 Seed completed! ${created} creados, ${skipped} ya existian`);
}

main()
  .catch(e => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
