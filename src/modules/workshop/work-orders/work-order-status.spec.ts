import { WorkOrderStatus } from '../../../generated/prisma/enums.js';
import {
  canApplySystemTransition,
  canChangeItems,
  canTransition,
  isClosed,
  isOverdue,
  MANUAL_TRANSITIONS,
  SYSTEM_TRANSITIONS,
  type SystemTransition,
} from './work-order-status.js';

// La tabla se prueba entera, par por par y para los dos roles: un cambio en
// una sola casilla tiene que romper un test, no pasar en silencio.

const STATUSES = Object.values(WorkOrderStatus);

/** Lo permitido, escrito a mano a partir del alcance (no copiado de la tabla). */
const ADMIN_ALLOWED = new Set([
  'RECEIVED→DIAGNOSIS',
  'RECEIVED→IN_PROGRESS',
  'RECEIVED→CANCELLED',
  'DIAGNOSIS→IN_PROGRESS',
  'DIAGNOSIS→CANCELLED',
  'WAITING_APPROVAL→CANCELLED',
  'IN_PROGRESS→WAITING_PARTS',
  'IN_PROGRESS→READY',
  'IN_PROGRESS→CANCELLED',
  'WAITING_PARTS→IN_PROGRESS',
  'WAITING_PARTS→CANCELLED',
  'READY→DELIVERED',
  'READY→IN_PROGRESS',
  'READY→CANCELLED',
]);

/** El mecánico: lo mismo, salvo entregar y cancelar. */
const MECHANIC_ALLOWED = new Set(
  [...ADMIN_ALLOWED].filter(
    (pair) => !pair.endsWith('→DELIVERED') && !pair.endsWith('→CANCELLED'),
  ),
);

describe('canTransition', () => {
  const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to]));

  it.each(pairs)('ADMIN %s → %s', (from, to) => {
    expect(canTransition(from, to, 'ADMIN')).toBe(
      ADMIN_ALLOWED.has(`${from}→${to}`),
    );
  });

  it.each(pairs)('MECHANIC %s → %s', (from, to) => {
    expect(canTransition(from, to, 'MECHANIC')).toBe(
      MECHANIC_ALLOWED.has(`${from}→${to}`),
    );
  });

  it('WAITING_APPROVAL no se pide a mano: entra y sale con el presupuesto', () => {
    for (const from of STATUSES) {
      expect(canTransition(from, 'WAITING_APPROVAL', 'ADMIN')).toBe(false);
    }
    expect(MANUAL_TRANSITIONS.WAITING_APPROVAL).toEqual(['CANCELLED']);
  });

  it('nadie mueve una orden entregada o cancelada', () => {
    for (const to of STATUSES) {
      expect(canTransition('DELIVERED', to, 'ADMIN')).toBe(false);
      expect(canTransition('CANCELLED', to, 'ADMIN')).toBe(false);
    }
  });

  it('un estado no pasa a sí mismo', () => {
    for (const status of STATUSES) {
      expect(canTransition(status, status, 'ADMIN')).toBe(false);
    }
  });
});

describe('canApplySystemTransition', () => {
  /** Las del presupuesto, escritas a mano a partir del alcance. */
  const SYSTEM_ALLOWED = new Set([
    'QUOTE_SENT:DIAGNOSIS→WAITING_APPROVAL',
    'QUOTE_SENT:IN_PROGRESS→WAITING_APPROVAL',
    'QUOTE_SENT:WAITING_PARTS→WAITING_APPROVAL',
    'QUOTE_APPROVED:WAITING_APPROVAL→IN_PROGRESS',
    'QUOTE_REJECTED:WAITING_APPROVAL→DIAGNOSIS',
  ]);
  const transitions = Object.keys(SYSTEM_TRANSITIONS) as SystemTransition[];
  const pairs = transitions.flatMap((transition) =>
    STATUSES.map((from) => [transition, from] as const),
  );

  it.each(pairs)('%s desde %s', (transition, from) => {
    const to = SYSTEM_TRANSITIONS[transition].to;
    expect(canApplySystemTransition(transition, from)).toBe(
      SYSTEM_ALLOWED.has(`${transition}:${from}→${to}`),
    );
  });

  it('ninguna es un botón: no están en la tabla manual', () => {
    for (const transition of transitions) {
      const { from, to } = SYSTEM_TRANSITIONS[transition];
      for (const status of from) {
        // Aprobar desde la espera sería «Iniciar reparación»; rechazar,
        // «Iniciar diagnóstico». Ninguno se ofrece a mano.
        expect(canTransition(status, to, 'ADMIN')).toBe(false);
      }
    }
  });

  it('no se envía un presupuesto sin diagnosticar, ya esperando, lista o cerrada', () => {
    for (const from of [
      'RECEIVED',
      'WAITING_APPROVAL',
      'READY',
      'DELIVERED',
      'CANCELLED',
    ] as const) {
      expect(canApplySystemTransition('QUOTE_SENT', from)).toBe(false);
    }
  });
});

describe('isClosed', () => {
  it('solo entregada y cancelada están cerradas', () => {
    expect(STATUSES.filter(isClosed)).toEqual(['DELIVERED', 'CANCELLED']);
  });
});

describe('canChangeItems', () => {
  it('los ítems se cambian mientras se diagnostica y se repara', () => {
    expect(STATUSES.filter(canChangeItems)).toEqual([
      'RECEIVED',
      'DIAGNOSIS',
      'IN_PROGRESS',
      'WAITING_PARTS',
    ]);
  });
});

describe('isOverdue', () => {
  const today = '2026-10-04';

  it('vence al día siguiente del prometido, no el mismo día', () => {
    expect(isOverdue('IN_PROGRESS', '2026-10-03', today)).toBe(true);
    expect(isOverdue('IN_PROGRESS', '2026-10-04', today)).toBe(false);
    expect(isOverdue('IN_PROGRESS', '2026-10-05', today)).toBe(false);
  });

  it('sin fecha prometida, o ya cerrada, no vence', () => {
    expect(isOverdue('RECEIVED', null, today)).toBe(false);
    expect(isOverdue('DELIVERED', '2026-09-01', today)).toBe(false);
    expect(isOverdue('CANCELLED', '2026-09-01', today)).toBe(false);
    expect(isOverdue('READY', '2026-09-01', today)).toBe(true);
  });
});
