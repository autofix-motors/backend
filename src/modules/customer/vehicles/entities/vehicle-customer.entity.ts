import { ApiProperty } from '@nestjs/swagger';
import type { Customer as CustomerModel } from '../../../../generated/prisma/client.js';
import { DocumentType } from '../../../../generated/prisma/enums.js';

export type VehicleCustomerModel = Pick<
  CustomerModel,
  'customerId' | 'name' | 'documentType' | 'documentNumber'
>;

/** El dueño de un vehículo, resumido: lo justo para mostrarlo en el listado. */
export class VehicleCustomer {
  constructor(customer: VehicleCustomerModel) {
    this.customerId = customer.customerId;
    this.name = customer.name;
    this.documentType = customer.documentType;
    this.documentNumber = customer.documentNumber;
  }

  @ApiProperty({ format: 'uuid' })
  customerId: string;

  @ApiProperty({ example: 'Juan Pérez Rojas' })
  name: string;

  @ApiProperty({ enum: DocumentType, enumName: 'DocumentType' })
  documentType: DocumentType;

  @ApiProperty({ example: '45678912' })
  documentNumber: string;
}
