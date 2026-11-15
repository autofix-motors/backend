import type { SessionUser } from '../../../core/auth/session-user.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { ProductsService } from '../../inventory/products/products.service.js';
import type { WorkOrderDashboardStats } from '../work-orders/work-order-stats.js';
import type { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { DashboardService, LOW_STOCK_LIMIT } from './dashboard.service.js';

// Lo que se prueba es lo que decide: quién ve qué. El mecánico recibe solo sus
// órdenes (el filtro sale de la sesión) y lo del administrador en null.

const ADMINISTRADOR: SessionUser = {
  usuarioId: 'admin-1',
  rol: 'ADMINISTRADOR',
};
const MECANICO: SessionUser = { usuarioId: 'mech-1', rol: 'MECANICO' };

const baseStats: Omit<WorkOrderDashboardStats, 'administracion'> = {
  indicadores: {
    abiertas: 3,
    esperandoAprobacion: 1,
    listas: 1,
    vencidas: 0,
    entregadasMes: 4,
  },
  porEstado: [{ estado: 'LISTO', cantidad: 1 }],
  tendencia: [{ mes: '2026-11', recibidas: 5, entregadas: 4 }],
  atencion: [
    {
      ordenTrabajoId: 'ot-1',
      numero: 7,
      placa: 'ABC123',
      estado: 'LISTO',
      fechaPrometida: '2026-11-16',
      vencida: false,
    },
  ],
};

describe('DashboardService', () => {
  const workOrders = { dashboardStats: vi.fn() };
  const products = { lowStock: vi.fn() };
  const service = new DashboardService(
    workOrders as unknown as WorkOrdersService,
    products as unknown as ProductsService,
  );

  afterEach(() => vi.resetAllMocks());

  it('al mecánico le filtra sus órdenes y deja en null lo del administrador', async () => {
    workOrders.dashboardStats.mockResolvedValue({
      ...baseStats,
      administracion: null,
    });

    const dashboard = await service.overview(MECANICO);

    expect(workOrders.dashboardStats).toHaveBeenCalledWith({
      mecanicoId: 'mech-1',
      incluirAdministracion: false,
    });
    expect(products.lowStock).not.toHaveBeenCalled();
    expect(dashboard.indicadores).toEqual({
      abiertas: 3,
      esperandoAprobacion: 1,
      listas: 1,
      vencidas: 0,
      entregadasMes: 4,
      valorEntregadoMes: null,
      stockBajo: null,
    });
    expect(dashboard.cargaMecanicos).toBeNull();
    expect(dashboard.serviciosTop).toBeNull();
    expect(dashboard.productosStockBajo).toBeNull();
    // Lo de sus órdenes sí sale.
    expect(dashboard.porEstado).toEqual([{ estado: 'LISTO', cantidad: 1 }]);
    expect(dashboard.tendencia).toEqual([
      { mes: '2026-11', recibidas: 5, entregadas: 4 },
    ]);
    expect(dashboard.atencion).toEqual(baseStats.atencion);
  });

  it('al administrador le da todo el taller, con montos como texto y el stock bajo', async () => {
    workOrders.dashboardStats.mockResolvedValue({
      ...baseStats,
      administracion: {
        valorEntregadoMes: new Prisma.Decimal('1500.5'),
        cargaMecanicos: [
          { usuarioId: null, nombre: 'Sin asignar', abiertas: 2 },
        ],
        serviciosTop: [{ nombre: 'Cambio de aceite', cantidad: 3 }],
      },
    });
    products.lowStock.mockResolvedValue({
      total: 9,
      productos: [
        {
          productoId: 'p-1',
          codigo: 'FA-001',
          nombre: 'Filtro de aceite',
          stock: new Prisma.Decimal('1.5'),
          stockMinimo: new Prisma.Decimal('4'),
          unidad: 'UNIDAD',
          // Una columna de más no sale: la entidad copia campo por campo.
          costo: new Prisma.Decimal('12'),
        },
      ],
    });

    const dashboard = await service.overview(ADMINISTRADOR);

    expect(workOrders.dashboardStats).toHaveBeenCalledWith({
      mecanicoId: undefined,
      incluirAdministracion: true,
    });
    expect(products.lowStock).toHaveBeenCalledWith(LOW_STOCK_LIMIT);
    expect(dashboard.indicadores.valorEntregadoMes).toBe('1500.50');
    expect(dashboard.indicadores.stockBajo).toBe(9);
    expect(dashboard.cargaMecanicos).toEqual([
      { usuarioId: null, nombre: 'Sin asignar', abiertas: 2 },
    ]);
    expect(dashboard.serviciosTop).toEqual([
      { nombre: 'Cambio de aceite', cantidad: 3 },
    ]);
    expect(dashboard.productosStockBajo).toEqual([
      {
        productoId: 'p-1',
        codigo: 'FA-001',
        nombre: 'Filtro de aceite',
        stock: '1.50',
        stockMinimo: '4.00',
        unidad: 'UNIDAD',
      },
    ]);
  });
});
