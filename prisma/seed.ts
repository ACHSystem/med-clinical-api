import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no esta definida: define la conexion en .env antes de ejecutar el seed.');
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

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

  const createdPatients = await Promise.all(
    patientsData.map(patient =>
      prisma.patient.create({
        data: {
          ...patient,
          userId: doctor.id,
          isActive: true,
        },
      })
    )
  );

  console.log(`✅ Created ${createdPatients.length} patients`);

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

  let providerCount = 0;
  let serviceCount = 0;

  for (let i = 0; i < providersData.length; i++) {
    const provider = await prisma.provider.create({
      data: {
        name: providersData[i].name,
        type: providersData[i].type,
        businessName: providersData[i].businessName,
        identify: providersData[i].identify,
        email: `contacto${i + 1}@proveedor.com`,
        phone: `+52${String(i).padStart(10, '0')}`,
        address: `Dirección ${providersData[i].name} #${i + 1}`,
        description: `Proveedor de ${providersData[i].type}`,
        isActive: true,
      },
    });

    const services = servicesData[i].map(serviceName =>
      prisma.providerService.create({
        data: {
          name: serviceName,
          description: `Servicio de ${serviceName}`,
          price: Math.floor(Math.random() * 5000) + 500,
          providerId: provider.id,
          isActive: true,
        },
      })
    );

    await Promise.all(services);
    providerCount++;
    serviceCount += services.length;
  }

  console.log(`✅ Created ${providerCount} providers with ${serviceCount} services`);

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

  const createdCosts = await Promise.all(
    costsData.map(cost =>
      prisma.serviceCost.create({
        data: cost,
      })
    )
  );

  console.log(`✅ Created ${createdCosts.length} service costs`);

  console.log('🎉 Seed completed!');
}

main()
  .catch(e => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });