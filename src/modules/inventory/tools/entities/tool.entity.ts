import { ApiProperty } from '@nestjs/swagger';
import type { Tool as ToolModel } from '../../../../generated/prisma/client.js';
import { ToolStatus } from '../../../../generated/prisma/enums.js';
import {
  ToolAssignee,
  type ToolAssigneeModel,
} from './tool-assignee.entity.js';

export type ToolWithAssignee = ToolModel & {
  assignedTo: ToolAssigneeModel | null;
};

/** Lo que sale de una herramienta por la API, con quién la tiene. */
export class Tool {
  constructor(tool: ToolWithAssignee) {
    this.toolId = tool.toolId;
    this.code = tool.code;
    this.name = tool.name;
    this.brand = tool.brand;
    this.status = tool.status;
    this.notes = tool.notes;
    this.assignedTo = tool.assignedTo && new ToolAssignee(tool.assignedTo);
    this.createdAt = tool.createdAt;
    this.updatedAt = tool.updatedAt;
  }

  @ApiProperty({ format: 'uuid' })
  toolId: string;

  @ApiProperty({ example: 'HER-TORQ-01' })
  code: string;

  @ApiProperty({ example: 'Torquímetro de 1/2" 40-200 N·m' })
  name: string;

  @ApiProperty({ type: String, nullable: true, example: 'Stanley' })
  brand: string | null;

  @ApiProperty({ enum: ToolStatus, enumName: 'ToolStatus' })
  status: ToolStatus;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({
    type: ToolAssignee,
    nullable: true,
    description: 'Quién la tiene; null si está en el almacén',
  })
  assignedTo: ToolAssignee | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
