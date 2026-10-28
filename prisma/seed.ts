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
  const hashedPassword = await bcrypt.hash('admin', 12);

  const doctor = await prisma.user.upsert({
    where: { email: 'doctor@medclinical.com' },
    update: {},
    create: {
      username: 'admin',
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
      username: 'assistant',
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
    { name: 'Ana', lastName: 'García', identify: 'V-12345678', email: 'ana.garcia@email.com', phone: '+581234567890', birthDate: new Date('1985-03-15'), gender: 'Femenino', address: 'Calle Principal 123, Ciudad' },
    { name: 'Carlos', lastName: 'López', identify: 'V-23456789', email: 'carlos.lopez@email.com', phone: '+581234567891', birthDate: new Date('1978-07-22'), gender: 'Masculino', address: 'Avenida Central 456, Ciudad' },
    { name: 'María', lastName: 'Rodríguez', identify: 'V-34567890', email: 'maria.rodriguez@email.com', phone: '+581234567892', birthDate: new Date('1992-11-08'), gender: 'Femenino', address: 'Plaza Mayor 789, Ciudad' },
    { name: 'Pedro', lastName: 'Martínez', identify: 'V-45678901', email: 'pedro.martinez@email.com', phone: '+581234567893', birthDate: new Date('1980-05-30'), gender: 'Masculino', address: 'Callejón Norte 321, Ciudad' },
    { name: 'Laura', lastName: 'Fernández', identify: 'V-56789012', email: 'laura.fernandez@email.com', phone: '+581234567894', birthDate: new Date('1988-09-12'), gender: 'Femenino', address: 'Boulevard Este 654, Ciudad' },
    { name: 'Miguel', lastName: 'Torres', identify: 'V-67890123', email: 'miguel.torres@email.com', phone: '+581234567895', birthDate: new Date('1975-01-25'), gender: 'Masculino', address: 'Avenida Oeste 987, Ciudad' },
    { name: 'Sofía', lastName: 'Jiménez', identify: 'V-78901234', email: 'sofia.jimenez@email.com', phone: '+581234567896', birthDate: new Date('1995-06-18'), gender: 'Femenino', address: 'Calle Sur 147, Ciudad' },
    { name: 'Javier', lastName: 'Díaz', identify: 'V-89012345', email: 'javier.diaz@email.com', phone: '+581234567897', birthDate: new Date('1982-12-03'), gender: 'Masculino', address: 'Plaza Norte 258, Ciudad' },
    { name: 'Isabel', lastName: 'Ruiz', identify: 'V-90123456', email: 'isabel.ruiz@email.com', phone: '+581234567898', birthDate: new Date('1990-04-07'), gender: 'Femenino', address: 'Pasaje Central 369, Ciudad' },
    { name: 'Roberto', lastName: 'Sánchez', identify: 'V-01234567', email: 'roberto.sanchez@email.com', phone: '+581234567899', birthDate: new Date('1973-08-14'), gender: 'Masculino', address: 'Avenida Sur 741, Ciudad' },
  ];

  // Patient tiene @@unique([clinicId, identify]) (y identify unico global), asi que
  // la guarda de idempotencia es findFirst por clinicId + identify.
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
    // Provider.identify es unico global: guarda por clinicId + identify para no duplicar.
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
    const today = new Date();
    const rateDate = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    ));
    dolar = await prisma.dolar.create({
      data: { value: 36.5, date: rateDate },
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

  const findSeededPatient = (identify: string) => {
    const patient = patients.find(p => p.identify === identify);
    if (!patient) {
      throw new Error(`No se encontró el paciente sembrado con identificación ${identify}.`);
    }
    return patient;
  };

  const ana = findSeededPatient('V-12345678');
  const carlos = findSeededPatient('V-23456789');
  const maria = findSeededPatient('V-34567890');

  const medicationsData = [
    { name: 'Losartán', activeIngredient: 'Losartán potásico', presentation: 'Tableta', concentration: '50 mg', form: 'VO' },
    { name: 'Ibuprofeno', activeIngredient: 'Ibuprofeno', presentation: 'Tableta', concentration: '400 mg', form: 'VO' },
  ];
  const medications = new Map<string, Awaited<ReturnType<typeof prisma.medication.create>>>();
  for (const medicationData of medicationsData) {
    const existingMedication = await prisma.medication.findFirst({
      where: {
        clinicId: clinic.id,
        name: medicationData.name,
        concentration: medicationData.concentration,
      },
    });
    const medication = existingMedication ?? await prisma.medication.create({
      data: { ...medicationData, clinicId: clinic.id },
    });
    medications.set(medication.name, medication);
    tally(!existingMedication);
  }

  const historiesData = [
    {
      title: 'Control de hipertensión - primer control',
      type: 'control',
      reason: 'Control de hipertensión arterial',
      symptoms: 'Dolor de cabeza',
      observations: 'Presión arterial elevada en consulta',
      diagnosis: 'Hipertensión arterial',
      evaluation: 'Se ajusta dosis de losartán',
      date: new Date(),
      status: 'COMPLETED',
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
      treatments: [
        {
          title: 'Control farmacológico de hipertensión',
          plan: 'Mantener tratamiento antihipertensivo y control domiciliario.',
          recommendations: 'Reducir el consumo de sal y registrar la presión arterial.',
          medications: [
            { name: 'Losartán', dose: '50 mg', frequency: 'cada 24 horas', route: 'VO', duration: '30 días', quantity: '1 tableta', instructions: 'Tomar por la mañana' },
          ],
        },
      ],
    },
    {
      title: 'Control de hipertensión - seguimiento mensual',
      type: 'control',
      reason: 'Seguimiento de hipertensión arterial',
      symptoms: 'Ninguno',
      observations: 'Buena adherencia, sin edema',
      diagnosis: 'Hipertensión arterial controlada',
      evaluation: 'Evolución favorable tras el cambio de tratamiento',
      date: new Date(),
      status: 'COMPLETED',
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
      treatments: [
        {
          title: 'Continuidad del tratamiento antihipertensivo',
          plan: 'Continuar esquema indicado y acudir a control mensual.',
          recommendations: 'Mantener registro diario de presión arterial.',
          medications: [
            { name: 'Losartán', dose: '50 mg', frequency: 'cada 24 horas', route: 'VO', duration: '30 días', quantity: '1 tableta', instructions: 'Continuar por la mañana' },
          ],
        },
      ],
    },
    {
      title: 'Primera consulta - dolor lumbar',
      type: 'consulta',
      reason: 'Dolor lumbar de 3 semanas',
      symptoms: 'Dolor lumbar sin irradiación',
      observations: 'Sin irradiación',
      diagnosis: 'Lumbalgia',
      evaluation: 'Se indica imagenología',
      date: new Date(),
      status: 'COMPLETED',
      patientId: carlos.id,
      templateId: null,
      templateSnapshot: null,
      notes: 'Dolor lumbar de 3 semanas de evolución, sin irradiación. Se indica imagenología.',
      data: {
        motivoConsulta: 'Dolor lumbar de 3 semanas',
        antecedentes: 'Ninguno relevante',
        medicacionActual: 'Ibuprofeno 400 mg cada 12 h',
      },
      treatments: [
        {
          title: 'Manejo inicial de lumbalgia',
          plan: 'Reposo relativo y evaluación con estudio de imagen.',
          recommendations: 'Evitar cargar peso hasta la reevaluación.',
          medications: [
            { name: 'Ibuprofeno', dose: '400 mg', frequency: 'cada 12 horas', route: 'VO', duration: '5 días', quantity: '1 tableta', instructions: 'Tomar con alimentos' },
          ],
        },
      ],
    },
    {
      title: 'Evaluación nutricional inicial',
      type: 'consulta',
      reason: 'Control de peso',
      symptoms: 'Sin síntomas referidos',
      observations: 'Sedentaria, sin alergias alimentarias',
      diagnosis: 'Exceso de peso',
      evaluation: 'Se establece plan de 1200 kcal',
      date: new Date(),
      status: 'COMPLETED',
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
      treatments: [
        {
          title: 'Plan nutricional inicial',
          plan: 'Plan de alimentación de 1200 kcal al día.',
          recommendations: 'Aumentar gradualmente la actividad física y registrar las comidas.',
          medications: [],
        },
      ],
    },
  ];

  let historyCount = 0;
  for (const history of historiesData) {
    const existingHistory = await prisma.medicalHistory.findFirst({
      where: { patientId: history.patientId, clinicId: clinic.id, title: history.title },
    });
    let historyRecord = existingHistory;
    if (existingHistory) {
      tally(false);
    } else {
      const { templateSnapshot, treatments, ...rest } = history;
      historyRecord = await prisma.medicalHistory.create({
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
    if (!historyRecord) {
      throw new Error(`No se pudo crear la historia médica "${history.title}".`);
    }

    for (const treatment of history.treatments) {
      const existingTreatment = await prisma.medicalTreatments.findFirst({
        where: { medicalHistoryId: historyRecord.id, clinicId: clinic.id, title: treatment.title },
      });
      if (existingTreatment) {
        tally(false);
        continue;
      }

      await prisma.medicalTreatments.create({
        data: {
          title: treatment.title,
          plan: treatment.plan,
          recommendations: treatment.recommendations,
          medicalHistory: { connect: { id: historyRecord.id } },
          clinic: { connect: { id: clinic.id } },
          treatmentMedications: {
            create: treatment.medications.map(indication => {
              const medication = medications.get(indication.name)!;
              return {
                medication: { connect: { id: medication.id } },
                medicationName: medication.name,
                activeIngredient: medication.activeIngredient,
                presentation: medication.presentation,
                concentration: medication.concentration,
                dose: indication.dose,
                frequency: indication.frequency,
                route: indication.route,
                duration: indication.duration,
                quantity: indication.quantity,
                instructions: indication.instructions,
                clinic: { connect: { id: clinic.id } },
              };
            }),
          },
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
