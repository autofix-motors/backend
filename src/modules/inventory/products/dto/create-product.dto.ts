import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsMoney, ToMoneyText } from '../../../../core/validation/money.js';
import {
  IsQuantity,
  ToQuantityText,
} from '../../../../core/validation/quantity.js';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';
import {
  ProductKind,
  UnitOfMeasure,
} from '../../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * El alta de un repuesto o insumo. **No lleva `stock`**: nace en 0 y solo
 * cambia con un movimiento (compra, consumo en una orden o ajuste), que es lo
 * que lo explica en el kardex. Si el DTO lo aceptara, el número dejaría de ser
 * la suma de sus movimientos. Un cuerpo que lo traiga es un 400 por
 * `forbidNonWhitelisted`, igual que cualquier propiedad de más.
 */
export class CreateProductDto {
  @ApiProperty({
    example: 'FA-TOY-90915',
    maxLength: 30,
    description:
      'Único. Se guarda en mayúsculas y sin espacios al inicio o al final',
  })
  // En mayúsculas: «fa-123» y «FA-123» son el mismo código en el mostrador, y
  // así el índice único de la base los trata como uno solo.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(30, { message: 'El código tiene como máximo 30 caracteres' })
  @IsNotEmpty({ message: 'Ingresa el código' })
  // class-validator evalúa de abajo hacia arriba y se detiene en el primer
  // error: el chequeo más básico va al final.
  @IsString({ message: 'Ingresa el código' })
  code: string;

  @ApiProperty({ example: 'Filtro de aceite Toyota Yaris', maxLength: 150 })
  @Transform(trim)
  @MaxLength(150, { message: 'El nombre tiene como máximo 150 caracteres' })
  @IsNotEmpty({ message: 'Ingresa el nombre del producto' })
  @IsString({ message: 'Ingresa el nombre del producto' })
  name: string;

  @ApiProperty({ enum: ProductKind, enumName: 'ProductKind' })
  @IsEnum(ProductKind, {
    message: 'El tipo es PART (repuesto) o SUPPLY (insumo)',
  })
  kind: ProductKind;

  @ApiProperty({ enum: UnitOfMeasure, enumName: 'UnitOfMeasure' })
  @IsEnum(UnitOfMeasure, {
    message: 'La unidad es UNIT, LITER, GALLON, KIT o METER',
  })
  unit: UnitOfMeasure;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Toyota',
    maxLength: 60,
  })
  @IsOptional()
  @TrimToNull()
  @MaxLength(60, { message: 'La marca tiene como máximo 60 caracteres' })
  @IsString({ message: 'La marca tiene que ser texto' })
  brand?: string | null;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: '4.00' },
      { type: 'number', example: 4 },
    ],
    description:
      'Stock mínimo, en la unidad del producto: de 0 a 99999999.99, con hasta 2 decimales. Con el stock en este valor o debajo, el producto sale como stock bajo',
  })
  @ToQuantityText()
  @IsQuantity('El stock mínimo')
  @IsNotEmpty({ message: 'Ingresa el stock mínimo' })
  minStock: string;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: '18.50' },
      { type: 'number', example: 18.5 },
    ],
    description:
      'Último costo de compra, en soles: de 0 a 99999999.99, con hasta 2 decimales',
  })
  // Sale del DTO como texto («18.5»), que Prisma guarda en el Decimal sin
  // pasar por un número.
  @ToMoneyText()
  @IsMoney('El costo')
  @IsNotEmpty({ message: 'Ingresa el costo' })
  cost: string;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: '30.00' },
      { type: 'number', example: 30 },
    ],
    description:
      'Precio de venta al cliente, en soles: de 0 a 99999999.99, con hasta 2 decimales',
  })
  @ToMoneyText()
  @IsMoney('El precio de venta')
  @IsNotEmpty({ message: 'Ingresa el precio de venta' })
  price: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'El estado tiene que ser verdadero o falso' })
  isActive?: boolean;
}
