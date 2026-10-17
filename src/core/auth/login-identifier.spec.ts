import { normalizeLoginIdentifier } from './login-identifier.js';

describe('normalizeLoginIdentifier', () => {
  it('con @ es un correo, en minúsculas y sin espacios', () => {
    expect(normalizeLoginIdentifier('  Juan@Correo.PE ')).toEqual({
      kind: 'email',
      value: 'juan@correo.pe',
    });
  });

  it('sin @ es un documento, como se guarda', () => {
    expect(normalizeLoginIdentifier(' 45.678.912 ')).toEqual({
      kind: 'document',
      value: '45678912',
    });
    expect(normalizeLoginIdentifier('20-123456789-1')).toEqual({
      kind: 'document',
      value: '201234567891',
    });
    expect(normalizeLoginIdentifier('ab12345')).toEqual({
      kind: 'document',
      value: 'AB12345',
    });
  });
});
