import { ROLES_KEY } from '../../../core/decorators/roles.decorator.js';
import { WorkOrdersController } from './work-orders.controller.js';

// Quién usa los presupuestos lo decide `@Roles` (el RolesGuard global lo
// aplica): el service no repite la regla. Se prueba la metadata porque un
// rol de más en el decorador no rompería ningún otro test.

const rolesOf = (method: keyof WorkOrdersController): unknown =>
  Reflect.getMetadata(ROLES_KEY, WorkOrdersController.prototype[method]);

describe('WorkOrdersController: roles de los presupuestos', () => {
  it('solo el administrador envía un presupuesto y registra la respuesta', () => {
    expect(rolesOf('sendQuote')).toEqual(['ADMIN']);
    expect(rolesOf('decideQuote')).toEqual(['ADMIN']);
  });

  it('el mecánico (el asignado: lo filtra el service) los ve en el detalle', () => {
    expect(rolesOf('findOne')).toEqual(['ADMIN', 'MECHANIC']);
  });
});
