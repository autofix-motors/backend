import { Prisma } from '../../../../generated/prisma/client.js';
import { ServiceCatalogItem } from './service-catalog-item.entity.js';

describe('ServiceCatalogItem', () => {
  it('saca el precio como texto con dos decimales', () => {
    const now = new Date();
    const item = new ServiceCatalogItem({
      servicioId: 's1',
      nombre: 'Cambio de aceite y filtro',
      descripcion: null,
      precioManoObra: new Prisma.Decimal('60.5'),
      activo: true,
      creadoEn: now,
      actualizadoEn: now,
    });
    expect(item.precioManoObra).toBe('60.50');
    expect(JSON.parse(JSON.stringify(item))).toMatchObject({
      precioManoObra: '60.50',
    });
  });
});
