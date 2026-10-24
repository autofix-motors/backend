/**
 * Deja la placa o el VIN como se guardan: en mayúsculas y sin espacios ni
 * guiones. «abc-123» y «ABC123» son la misma placa, y es lo que se compara
 * para no registrar dos veces el mismo vehículo.
 */
export function normalizeIdentifier(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

// Las placas peruanas tienen 6 caracteres (ABC123, A1B234); se aceptan de 5 a 7
// para las antiguas y las de otros formatos (motos, placas especiales).
export const PLATE_PATTERN = /^[A-Z0-9]{5,7}$/;
export const PLATE_MESSAGE = 'La placa tiene de 5 a 7 letras o dígitos';

// 17 caracteres sin I, O ni Q: la norma del número de serie las excluye para
// no confundirlas con 1 y 0.
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
export const VIN_MESSAGE = 'El VIN tiene 17 letras o dígitos, sin I, O ni Q';

export const MIN_VEHICLE_YEAR = 1950;

/**
 * El año más alto que se acepta: el siguiente al actual, porque los modelos
 * del año que viene se venden desde mediados de año. Se calcula en cada
 * validación para que no quede fijo en el año en que arrancó la API.
 */
export function maxVehicleYear(now = new Date()): number {
  return now.getFullYear() + 1;
}
