import { EstadoOrden } from '../../../generated/prisma/enums.js';
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

const STATUSES = Object.values(EstadoOrden);

/** Lo permitido, escrito a mano a partir del alcance (no copiado de la tabla). */
const ADMIN_ALLOWED = new Set([
  'RECIBIDO→EN_DIAGNOSTICO',
  'RECIBIDO→EN_REPARACION',
  'RECIBIDO→CANCELADO',
  'EN_DIAGNOSTICO→EN_REPARACION',
  'EN_DIAGNOSTICO→CANCELADO',
  'ESPERANDO_APROBACION→CANCELADO',
  'EN_REPARACION→ESPERANDO_REPUESTOS',
  'EN_REPARACION→LISTO',
  'EN_REPARACION→CANCELADO',
  'ESPERANDO_REPUESTOS→EN_REPARACION',
  'ESPERANDO_REPUESTOS→CANCELADO',
  'LISTO→ENTREGADO',
  'LISTO→EN_REPARACION',
  'LISTO→CANCELADO',
]);

/** El mecánico: lo mismo, salvo entregar y cancelar. */
const MECHANIC_ALLOWED = new Set(
  [...ADMIN_ALLOWED].filter(
    (pair) => !pair.endsWith('→ENTREGADO') && !pair.endsWith('→CANCELADO'),
  ),
);

describe('canTransition', () => {
  const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to]));

  it.each(pairs)('ADMINISTRADOR %s → %s', (from, to) => {
    expect(canTransition(from, to, 'ADMINISTRADOR')).toBe(
      ADMIN_ALLOWED.has(`${from}→${to}`),
    );
  });

  it.each(pairs)('MECANICO %s → %s', (from, to) => {
    expect(canTransition(from, to, 'MECANICO')).toBe(
      MECHANIC_ALLOWED.has(`${from}→${to}`),
    );
  });

  it('ESPERANDO_APROBACION no se pide a mano: entra y sale con el presupuesto', () => {
    for (const from of STATUSES) {
      expect(canTransition(from, 'ESPERANDO_APROBACION', 'ADMINISTRADOR')).toBe(
        false,
      );
    }
    expect(MANUAL_TRANSITIONS.ESPERANDO_APROBACION).toEqual(['CANCELADO']);
  });

  it('nadie mueve una orden entregada o cancelada', () => {
    for (const to of STATUSES) {
      expect(canTransition('ENTREGADO', to, 'ADMINISTRADOR')).toBe(false);
      expect(canTransition('CANCELADO', to, 'ADMINISTRADOR')).toBe(false);
    }
  });

  it('un estado no pasa a sí mismo', () => {
    for (const estado of STATUSES) {
      expect(canTransition(estado, estado, 'ADMINISTRADOR')).toBe(false);
    }
  });
});

describe('canApplySystemTransition', () => {
  /** Las del presupuesto, escritas a mano a partir del alcance. */
  const SYSTEM_ALLOWED = new Set([
    'PRESUPUESTO_ENVIADO:EN_DIAGNOSTICO→ESPERANDO_APROBACION',
    'PRESUPUESTO_ENVIADO:EN_REPARACION→ESPERANDO_APROBACION',
    'PRESUPUESTO_ENVIADO:ESPERANDO_REPUESTOS→ESPERANDO_APROBACION',
    'PRESUPUESTO_APROBADO:ESPERANDO_APROBACION→EN_REPARACION',
    'PRESUPUESTO_RECHAZADO:ESPERANDO_APROBACION→EN_DIAGNOSTICO',
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
      for (const estado of from) {
        // Aprobar desde la espera sería «Iniciar reparación»; rechazar,
        // «Iniciar diagnóstico». Ninguno se ofrece a mano.
        expect(canTransition(estado, to, 'ADMINISTRADOR')).toBe(false);
      }
    }
  });

  it('no se envía un presupuesto sin diagnosticar, ya esperando, lista o cerrada', () => {
    for (const from of [
      'RECIBIDO',
      'ESPERANDO_APROBACION',
      'LISTO',
      'ENTREGADO',
      'CANCELADO',
    ] as const) {
      expect(canApplySystemTransition('PRESUPUESTO_ENVIADO', from)).toBe(false);
    }
  });
});

describe('isClosed', () => {
  it('solo entregada y cancelada están cerradas', () => {
    expect(STATUSES.filter(isClosed)).toEqual(['ENTREGADO', 'CANCELADO']);
  });
});

describe('canChangeItems', () => {
  it('los detalles se cambian mientras se diagnostica y se repara', () => {
    expect(STATUSES.filter(canChangeItems)).toEqual([
      'RECIBIDO',
      'EN_DIAGNOSTICO',
      'EN_REPARACION',
      'ESPERANDO_REPUESTOS',
    ]);
  });
});

describe('isOverdue', () => {
  const today = '2026-10-04';

  it('vence al día siguiente del prometido, no el mismo día', () => {
    expect(isOverdue('EN_REPARACION', '2026-10-03', today)).toBe(true);
    expect(isOverdue('EN_REPARACION', '2026-10-04', today)).toBe(false);
    expect(isOverdue('EN_REPARACION', '2026-10-05', today)).toBe(false);
  });

  it('sin fecha prometida, o ya cerrada, no vence', () => {
    expect(isOverdue('RECIBIDO', null, today)).toBe(false);
    expect(isOverdue('ENTREGADO', '2026-09-01', today)).toBe(false);
    expect(isOverdue('CANCELADO', '2026-09-01', today)).toBe(false);
    expect(isOverdue('LISTO', '2026-09-01', today)).toBe(true);
  });
});
