import { Prisma } from '../../../../generated/prisma/client.js';
import { ServiceCatalogItem } from './service-catalog-item.entity.js';

describe('ServiceCatalogItem', () => {
  it('saca el precio como texto con dos decimales', () => {
    const now = new Date();
    const item = new ServiceCatalogItem({
      serviceCatalogItemId: 's1',
      name: 'Cambio de aceite y filtro',
      description: null,
      laborPrice: new Prisma.Decimal('60.5'),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    expect(item.laborPrice).toBe('60.50');
    expect(JSON.parse(JSON.stringify(item))).toMatchObject({
      laborPrice: '60.50',
    });
  });
});
