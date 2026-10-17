import type { PrismaClient } from '../../src/generated/prisma/client.js';

// El catálogo de servicios con que arranca el taller. La mano de obra es una
// estimación del mercado de Lima (taller independiente, auto liviano, 2026):
// sirve de punto de partida, y el administrador la ajusta desde el catálogo.
//
// `upsert` con `update: {}`: si el servicio ya existe no se toca, para que
// volver a sembrar no pise el precio que el taller ya ajustó.

interface SeedService {
  name: string;
  description: string;
  laborPrice: string;
}

const SERVICES: SeedService[] = [
  {
    name: 'Cambio de aceite y filtro',
    description:
      'Drenado, cambio de filtro de aceite y llenado. El aceite se cobra aparte.',
    laborPrice: '35.00',
  },
  {
    name: 'Afinamiento menor',
    description:
      'Cambio de bujías y filtros de aire y combustible, revisión de niveles.',
    laborPrice: '120.00',
  },
  {
    name: 'Afinamiento mayor',
    description:
      'Afinamiento menor más limpieza de inyectores y del cuerpo de aceleración.',
    laborPrice: '220.00',
  },
  {
    name: 'Diagnóstico con escáner',
    description:
      'Lectura y borrado de códigos de falla con escáner OBD2, con informe.',
    laborPrice: '60.00',
  },
  {
    name: 'Cambio de pastillas de freno (por eje)',
    description:
      'Cambio de pastillas de un eje y revisión de discos y calipers.',
    laborPrice: '80.00',
  },
  {
    name: 'Rectificado de discos de freno (par)',
    description: 'Rectificado de los dos discos de un eje en torno.',
    laborPrice: '90.00',
  },
  {
    name: 'Mantenimiento de frenos posteriores',
    description: 'Limpieza, regulación o cambio de zapatas de tambor.',
    laborPrice: '90.00',
  },
  {
    name: 'Cambio de líquido de frenos',
    description: 'Purga completa del sistema con líquido nuevo.',
    laborPrice: '60.00',
  },
  {
    name: 'Alineamiento',
    description: 'Alineamiento computarizado de dirección.',
    laborPrice: '60.00',
  },
  {
    name: 'Balanceo (4 ruedas)',
    description: 'Balanceo de las cuatro ruedas con contrapesos.',
    laborPrice: '40.00',
  },
  {
    name: 'Cambio de batería',
    description: 'Cambio de batería y revisión del sistema de carga.',
    laborPrice: '20.00',
  },
  {
    name: 'Cambio de amortiguadores (par)',
    description: 'Cambio de los dos amortiguadores de un eje.',
    laborPrice: '120.00',
  },
  {
    name: 'Cambio de faja de distribución',
    description: 'Cambio de faja o kit de distribución con su tensor.',
    laborPrice: '250.00',
  },
  {
    name: 'Cambio de faja de accesorios',
    description: 'Cambio de la faja del alternador, la bomba y el compresor.',
    laborPrice: '60.00',
  },
  {
    name: 'Cambio de kit de embrague',
    description: 'Desmontaje de caja, cambio de disco, prensa y collarín.',
    laborPrice: '350.00',
  },
  {
    name: 'Cambio de refrigerante',
    description:
      'Purga del sistema de enfriamiento y llenado con refrigerante nuevo.',
    laborPrice: '50.00',
  },
  {
    name: 'Limpieza de inyectores',
    description:
      'Limpieza por ultrasonido y prueba de caudal de los inyectores.',
    laborPrice: '150.00',
  },
  {
    name: 'Mantenimiento de aire acondicionado',
    description: 'Revisión de fugas, vacío y carga de gas refrigerante.',
    laborPrice: '150.00',
  },
  {
    name: 'Revisión de suspensión y dirección',
    description: 'Inspección de rótulas, terminales, bujes y amortiguadores.',
    laborPrice: '50.00',
  },
  {
    name: 'Cambio de bujías',
    description: 'Cambio del juego de bujías.',
    laborPrice: '40.00',
  },
  {
    name: 'Lavado de motor',
    description: 'Lavado y desengrasado del compartimiento del motor.',
    laborPrice: '40.00',
  },
  {
    name: 'Inspección previa a revisión técnica',
    description:
      'Chequeo de luces, frenos, emisiones y llantas antes de la revisión técnica.',
    laborPrice: '50.00',
  },
];

export async function seedWorkshop(prisma: PrismaClient) {
  for (const service of SERVICES) {
    await prisma.serviceCatalogItem.upsert({
      where: { name: service.name },
      create: service,
      update: {},
    });
  }
  console.log(`Catálogo de servicios: ${SERVICES.length} servicios base.`);
}
