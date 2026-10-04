import { ApiProperty } from '@nestjs/swagger';
import type { Customer as CustomerModel } from '../../../../generated/prisma/client.js';
import { DocumentType } from '../../../../generated/prisma/enums.js';

export type CustomerWithCounts = CustomerModel & {
  _count: { vehicles: number };
};

/** Lo que sale de un cliente por la API, con cuántos vehículos tiene. */
export class Customer {
  constructor(customer: CustomerWithCounts) {
    this.customerId = customer.customerId;
    this.documentType = customer.documentType;
    this.documentNumber = customer.documentNumber;
    this.name = customer.name;
    this.phone = customer.phone;
    this.email = customer.email;
    this.address = customer.address;
    this.notes = customer.notes;
    this.isActive = customer.isActive;
    this.vehiclesCount = customer._count.vehicles;
    this.createdAt = customer.createdAt;
    this.updatedAt = customer.updatedAt;
  }

  @ApiProperty({ format: 'uuid' })
  customerId: string;

  @ApiProperty({ enum: DocumentType, enumName: 'DocumentType' })
  documentType: DocumentType;

  @ApiProperty({ example: '45678912' })
  documentNumber: string;

  @ApiProperty({ example: 'Juan Pérez Rojas' })
  name: string;

  @ApiProperty({ example: '987654321' })
  phone: string;

  @ApiProperty({ type: String, nullable: true, example: 'juan@correo.pe' })
  email: string | null;

  @ApiProperty({ type: String, nullable: true })
  address: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ example: 2 })
  vehiclesCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
