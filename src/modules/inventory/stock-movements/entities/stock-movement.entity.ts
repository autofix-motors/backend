import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { StockMovement as StockMovementModel } from '../../../../generated/prisma/client.js';
import { StockMovementType } from '../../../../generated/prisma/enums.js';
import {
  StockMovementProduct,
  type StockMovementProductModel,
} from './stock-movement-product.entity.js';
import {
  StockMovementUser,
  type StockMovementUserModel,
} from './stock-movement-user.entity.js';

export type StockMovementWithRelations = StockMovementModel & {
  product: StockMovementProductModel;
  createdBy: StockMovementUserModel;
};

/**
 * Lo que sale de un movimiento de stock por la API: una línea del kardex.
 *
 * El costo unitario solo se copia con `includeCosts` (el administrador): el
 * mecánico consulta el kardex pero no ve costos, igual que en los productos.
 * No hay stock resultante («saldo») porque no se guarda: calcularlo por fila
 * exigiría recorrer todo el kardex anterior del producto en cada página.
 */
export class StockMovement {
  constructor(
    movement: StockMovementWithRelations,
    { includeCosts }: { includeCosts: boolean },
  ) {
    this.stockMovementId = movement.stockMovementId;
    this.type = movement.type;
    // Texto con dos decimales y su signo: «-2.00» es una salida.
    this.quantity = movement.quantity.toFixed(2);
    if (includeCosts) {
      this.unitCost = movement.unitCost?.toFixed(2) ?? null;
    }
    this.note = movement.note;
    this.workOrderItemId = movement.workOrderItemId;
    this.product = new StockMovementProduct(movement.product);
    this.createdBy = new StockMovementUser(movement.createdBy);
    this.createdAt = movement.createdAt;
  }

  @ApiProperty({ format: 'uuid' })
  stockMovementId: string;

  @ApiProperty({ enum: StockMovementType, enumName: 'StockMovementType' })
  type: StockMovementType;

  @ApiProperty({
    example: '-2.00',
    description:
      'Con signo, en la unidad del producto: positiva entra y negativa sale',
  })
  quantity: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '18.50',
    description:
      'Costo unitario en soles: el de la compra, o el del producto al momento de un ajuste o un consumo. Solo para ADMIN',
  })
  unitCost?: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Inventario físico de fin de mes',
  })
  note: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description:
      'El ítem de la orden de trabajo que generó la salida. Solo en WORK_ORDER; vacío si el ítem se quitó de la orden',
  })
  workOrderItemId: string | null;

  @ApiProperty({ type: StockMovementProduct })
  product: StockMovementProduct;

  @ApiProperty({ type: StockMovementUser, description: 'Quién lo registró' })
  createdBy: StockMovementUser;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}
