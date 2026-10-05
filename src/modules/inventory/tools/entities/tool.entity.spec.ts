import { Tool } from './tool.entity.js';

function model(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    toolId: 't1',
    code: 'HER-TORQ-01',
    name: 'Torquímetro de 1/2"',
    brand: 'Stanley',
    status: 'AVAILABLE' as const,
    notes: null,
    assignedToId: 'u1',
    assignedTo: { userId: 'u1', name: 'Jorge Quispe' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Tool', () => {
  it('saca quién la tiene con su id y su nombre, sin repetir la clave foránea', () => {
    const json = JSON.parse(JSON.stringify(new Tool(model())));
    expect(json.assignedTo).toEqual({ userId: 'u1', name: 'Jorge Quispe' });
    expect(json).not.toHaveProperty('assignedToId');
  });

  it('en el almacén, assignedTo es null', () => {
    const tool = new Tool(model({ assignedToId: null, assignedTo: null }));
    expect(tool.assignedTo).toBeNull();
  });

  it('no deja pasar datos de la cuenta del usuario', () => {
    const tool = new Tool(
      model({
        assignedTo: {
          userId: 'u1',
          name: 'Jorge Quispe',
          email: 'jorge@autofix.local',
          passwordHash: 'x',
        },
      }),
    );
    expect(Object.keys(tool.assignedTo ?? {})).toEqual(['userId', 'name']);
  });
});
