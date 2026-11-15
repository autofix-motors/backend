import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MovimientoStock as StockMovementModel } from '../../../../generated/prisma/client.js';
import { TipoMovimiento } from '../../../../generated/prisma/enums.js';
import {
  StockMovementProduct,
  type StockMovementProductModel,
} from './stock-movement-product.entity.js';
import {
  StockMovementUser,
  type StockMovementUserModel,
} from './stock-movement-user.entity.js';

export type StockMovementWithRelations = StockMovementModel & {
  producto: StockMovementProductModel;
  creadoPor: StockMovementUserModel;
};

/**
 * Lo que sale de un movimiento de stock por la API: una línea del kardex.
 *
 * El costo unitario solo se copia con `incluirCostos` (el administrador): el
 * mecánico consulta el kardex pero no ve costos, igual que en los productos.
 * No hay stock resultante («saldo») porque no se guarda: calcularlo por fila
 * exigiría recorrer todo el kardex anterior del producto en cada página.
 */
export class StockMovement {
  constructor(
    movement: StockMovementWithRelations,
    { incluirCostos }: { incluirCostos: boolean },
  ) {
    this.movimientoStockId = movement.movimientoStockId;
    this.tipo = movement.tipo;
    // Texto con dos decimales y su signo: «-2.00» es una salida.
    this.cantidad = movement.cantidad.toFixed(2);
    if (incluirCostos) {
      this.costoUnitario = movement.costoUnitario?.toFixed(2) ?? null;
    }
    this.nota = movement.nota;
    this.detalleOrdenId = movement.detalleOrdenId;
    this.producto = new StockMovementProduct(movement.producto);
    this.creadoPor = new StockMovementUser(movement.creadoPor);
    this.creadoEn = movement.creadoEn;
  }

  @ApiProperty({ format: 'uuid' })
  movimientoStockId: string;

  @ApiProperty({ enum: TipoMovimiento, enumName: 'TipoMovimiento' })
  tipo: TipoMovimiento;

  @ApiProperty({
    example: '-2.00',
    description:
      'Con signo, en la unidad del producto: positiva entra y negativa sale',
  })
  cantidad: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '18.50',
    description:
      'Costo unitario en soles: el de la compra, o el del producto al momento de un ajuste o un consumo. Solo para ADMINISTRADOR',
  })
  costoUnitario?: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Inventario físico de fin de mes',
  })
  nota: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description:
      'El detalle de la orden de trabajo que generó la salida. Solo en ORDEN_TRABAJO; vacío si el detalle se quitó de la orden',
  })
  detalleOrdenId: string | null;

  @ApiProperty({ type: StockMovementProduct })
  producto: StockMovementProduct;

  @ApiProperty({ type: StockMovementUser, description: 'Quién lo registró' })
  creadoPor: StockMovementUser;

  @ApiProperty({ format: 'date-time' })
  creadoEn: Date;
}
