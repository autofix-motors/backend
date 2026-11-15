import { normalizeLoginIdentifier } from './login-identifier.js';

describe('normalizeLoginIdentifier', () => {
  it('con @ es un correo, en minúsculas y sin espacios', () => {
    expect(normalizeLoginIdentifier('  Juan@Correo.PE ')).toEqual({
      tipo: 'correo',
      valor: 'juan@correo.pe',
    });
  });

  it('sin @ es un documento, como se guarda', () => {
    expect(normalizeLoginIdentifier(' 45.678.912 ')).toEqual({
      tipo: 'documento',
      valor: '45678912',
    });
    expect(normalizeLoginIdentifier('20-123456789-1')).toEqual({
      tipo: 'documento',
      valor: '201234567891',
    });
    expect(normalizeLoginIdentifier('ab12345')).toEqual({
      tipo: 'documento',
      valor: 'AB12345',
    });
  });
});
