import type { PrismaClient } from '../../src/generated/prisma/client.js';

// El catálogo de servicios con que arranca el taller. La mano de obra es una
// estimación del mercado de Lima (taller independiente, auto liviano, 2026):
// sirve de punto de partida, y el administrador la ajusta desde el catálogo.
//
// `upsert` con `update: {}`: si el servicio ya existe no se toca, para que
// volver a sembrar no pise el precio que el taller ya ajustó.

interface SeedService {
  nombre: string;
  descripcion: string;
  precioManoObra: string;
}

const SERVICES: SeedService[] = [
  {
    nombre: 'Cambio de aceite y filtro',
    descripcion:
      'Drenado, cambio de filtro de aceite y llenado. El aceite se cobra aparte.',
    precioManoObra: '35.00',
  },
  {
    nombre: 'Afinamiento menor',
    descripcion:
      'Cambio de bujías y filtros de aire y combustible, revisión de niveles.',
    precioManoObra: '120.00',
  },
  {
    nombre: 'Afinamiento mayor',
    descripcion:
      'Afinamiento menor más limpieza de inyectores y del cuerpo de aceleración.',
    precioManoObra: '220.00',
  },
  {
    nombre: 'Diagnóstico con escáner',
    descripcion:
      'Lectura y borrado de códigos de falla con escáner OBD2, con informe.',
    precioManoObra: '60.00',
  },
  {
    nombre: 'Cambio de pastillas de freno (por eje)',
    descripcion:
      'Cambio de pastillas de un eje y revisión de discos y calipers.',
    precioManoObra: '80.00',
  },
  {
    nombre: 'Rectificado de discos de freno (par)',
    descripcion: 'Rectificado de los dos discos de un eje en torno.',
    precioManoObra: '90.00',
  },
  {
    nombre: 'Mantenimiento de frenos posteriores',
    descripcion: 'Limpieza, regulación o cambio de zapatas de tambor.',
    precioManoObra: '90.00',
  },
  {
    nombre: 'Cambio de líquido de frenos',
    descripcion: 'Purga completa del sistema con líquido nuevo.',
    precioManoObra: '60.00',
  },
  {
    nombre: 'Alineamiento',
    descripcion: 'Alineamiento computarizado de dirección.',
    precioManoObra: '60.00',
  },
  {
    nombre: 'Balanceo (4 ruedas)',
    descripcion: 'Balanceo de las cuatro ruedas con contrapesos.',
    precioManoObra: '40.00',
  },
  {
    nombre: 'Cambio de batería',
    descripcion: 'Cambio de batería y revisión del sistema de carga.',
    precioManoObra: '20.00',
  },
  {
    nombre: 'Cambio de amortiguadores (par)',
    descripcion: 'Cambio de los dos amortiguadores de un eje.',
    precioManoObra: '120.00',
  },
  {
    nombre: 'Cambio de faja de distribución',
    descripcion: 'Cambio de faja o kit de distribución con su tensor.',
    precioManoObra: '250.00',
  },
  {
    nombre: 'Cambio de faja de accesorios',
    descripcion: 'Cambio de la faja del alternador, la bomba y el compresor.',
    precioManoObra: '60.00',
  },
  {
    nombre: 'Cambio de kit de embrague',
    descripcion: 'Desmontaje de caja, cambio de disco, prensa y collarín.',
    precioManoObra: '350.00',
  },
  {
    nombre: 'Cambio de refrigerante',
    descripcion:
      'Purga del sistema de enfriamiento y llenado con refrigerante nuevo.',
    precioManoObra: '50.00',
  },
  {
    nombre: 'Limpieza de inyectores',
    descripcion:
      'Limpieza por ultrasonido y prueba de caudal de los inyectores.',
    precioManoObra: '150.00',
  },
  {
    nombre: 'Mantenimiento de aire acondicionado',
    descripcion: 'Revisión de fugas, vacío y carga de gas refrigerante.',
    precioManoObra: '150.00',
  },
  {
    nombre: 'Revisión de suspensión y dirección',
    descripcion: 'Inspección de rótulas, terminales, bujes y amortiguadores.',
    precioManoObra: '50.00',
  },
  {
    nombre: 'Cambio de bujías',
    descripcion: 'Cambio del juego de bujías.',
    precioManoObra: '40.00',
  },
  {
    nombre: 'Lavado de motor',
    descripcion: 'Lavado y desengrasado del compartimiento del motor.',
    precioManoObra: '40.00',
  },
  {
    nombre: 'Inspección previa a revisión técnica',
    descripcion:
      'Chequeo de luces, frenos, emisiones y llantas antes de la revisión técnica.',
    precioManoObra: '50.00',
  },
];

export async function seedWorkshop(prisma: PrismaClient) {
  for (const service of SERVICES) {
    await prisma.servicio.upsert({
      where: { nombre: service.nombre },
      create: service,
      update: {},
    });
  }
  console.log(`Catálogo de servicios: ${SERVICES.length} servicios base.`);
}
