import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  TipoMovimiento,
  TipoProducto,
  UnidadMedida,
} from '../../src/generated/prisma/enums.js';

// Los repuestos e insumos con que arranca el taller. Costos y
// precios son una estimación del mercado de Lima (2026), con un margen de 35 a
// 50 %: sirven de punto de partida y el administrador los ajusta.
//
// El stock inicial no se escribe a mano en el producto: entra como una compra
// en el kardex (COMPRA, con su costo), igual que entraría desde la pantalla,
// para que el stock sea siempre la suma de sus movimientos. Se registra solo
// cuando el producto se crea: volver a sembrar no duplica stock ni pisa lo que
// el taller ya cambió (`update: {}`).

interface SeedProduct {
  codigo: string;
  nombre: string;
  tipo: TipoProducto;
  unidad: UnidadMedida;
  marca: string;
  stockMinimo: string;
  costo: string;
  precio: string;
  /** El stock con que arranca, como compra inicial. */
  stockInicial: string;
}

const { REPUESTO, INSUMO } = TipoProducto;
const { UNIDAD, LITRO, GALON, KIT } = UnidadMedida;

const PRODUCTS: SeedProduct[] = [
  // Aceites y fluidos
  {
    codigo: 'ACE-5W30-GAL',
    nombre: 'Aceite sintético 5W-30 (galón)',
    tipo: INSUMO,
    unidad: GALON,
    marca: 'Castrol Magnatec',
    stockMinimo: '4',
    costo: '95.00',
    precio: '135.00',
    stockInicial: '12',
  },
  {
    codigo: 'ACE-20W50-GAL',
    nombre: 'Aceite mineral 20W-50 (galón)',
    tipo: INSUMO,
    unidad: GALON,
    marca: 'Mobil Super',
    stockMinimo: '4',
    costo: '70.00',
    precio: '100.00',
    stockInicial: '10',
  },
  {
    codigo: 'ACE-10W40-LT',
    nombre: 'Aceite semisintético 10W-40 (litro)',
    tipo: INSUMO,
    unidad: LITRO,
    marca: 'Shell Helix HX7',
    stockMinimo: '8',
    costo: '28.00',
    precio: '40.00',
    stockInicial: '24',
  },
  {
    codigo: 'ATF-DEX3-LT',
    nombre: 'Aceite de transmisión automática ATF Dexron III (litro)',
    tipo: INSUMO,
    unidad: LITRO,
    marca: 'Valvoline',
    stockMinimo: '4',
    costo: '25.00',
    precio: '38.00',
    stockInicial: '12',
  },
  {
    codigo: 'LIQ-FRENO-DOT4',
    nombre: 'Líquido de frenos DOT 4 (500 ml)',
    tipo: INSUMO,
    unidad: UNIDAD,
    marca: 'Bosch',
    stockMinimo: '4',
    costo: '18.00',
    precio: '30.00',
    stockInicial: '10',
  },
  {
    codigo: 'REF-VERDE-GAL',
    nombre: 'Refrigerante listo para usar (galón)',
    tipo: INSUMO,
    unidad: GALON,
    marca: 'Prestone',
    stockMinimo: '3',
    costo: '25.00',
    precio: '40.00',
    stockInicial: '8',
  },
  {
    codigo: 'GAS-R134A',
    nombre: 'Gas refrigerante R134a (lata)',
    tipo: INSUMO,
    unidad: UNIDAD,
    marca: 'Genetron',
    stockMinimo: '2',
    costo: '60.00',
    precio: '100.00',
    stockInicial: '6',
  },
  // Filtros
  {
    codigo: 'FA-TOY-90915',
    nombre: 'Filtro de aceite Toyota (Yaris, Corolla, Hilux)',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Toyota',
    stockMinimo: '5',
    costo: '15.00',
    precio: '28.00',
    stockInicial: '15',
  },
  {
    codigo: 'FA-HYU-26300',
    nombre: 'Filtro de aceite Hyundai/Kia (Accent, Rio)',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Hyundai',
    stockMinimo: '5',
    costo: '16.00',
    precio: '30.00',
    stockInicial: '15',
  },
  {
    codigo: 'FAI-TOY-YARIS',
    nombre: 'Filtro de aire Toyota Yaris',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Toyota',
    stockMinimo: '3',
    costo: '25.00',
    precio: '45.00',
    stockInicial: '8',
  },
  {
    codigo: 'FAI-HYU-ACCENT',
    nombre: 'Filtro de aire Hyundai Accent',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Hyundai',
    stockMinimo: '3',
    costo: '25.00',
    precio: '45.00',
    stockInicial: '8',
  },
  {
    codigo: 'FCAB-UNIV',
    nombre: 'Filtro de cabina (aire acondicionado)',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Bosch',
    stockMinimo: '3',
    costo: '20.00',
    precio: '38.00',
    stockInicial: '8',
  },
  {
    codigo: 'FCOMB-UNIV',
    nombre: 'Filtro de combustible',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Bosch',
    stockMinimo: '3',
    costo: '25.00',
    precio: '45.00',
    stockInicial: '6',
  },
  // Frenos
  {
    codigo: 'PAS-DEL-YARIS',
    nombre: 'Pastillas de freno delanteras Toyota Yaris (juego)',
    tipo: REPUESTO,
    unidad: KIT,
    marca: 'Bosch',
    stockMinimo: '2',
    costo: '70.00',
    precio: '120.00',
    stockInicial: '6',
  },
  {
    codigo: 'PAS-DEL-ACCENT',
    nombre: 'Pastillas de freno delanteras Hyundai Accent (juego)',
    tipo: REPUESTO,
    unidad: KIT,
    marca: 'Bosch',
    stockMinimo: '2',
    costo: '70.00',
    precio: '120.00',
    stockInicial: '6',
  },
  // Encendido y eléctrico
  {
    codigo: 'BUJ-NGK-IRID',
    nombre: 'Bujía de iridio',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'NGK',
    stockMinimo: '8',
    costo: '35.00',
    precio: '55.00',
    stockInicial: '24',
  },
  {
    codigo: 'BUJ-NGK-STD',
    nombre: 'Bujía estándar',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'NGK',
    stockMinimo: '8',
    costo: '10.00',
    precio: '18.00',
    stockInicial: '24',
  },
  {
    codigo: 'BAT-13PL',
    nombre: 'Batería 13 placas',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Etna',
    stockMinimo: '2',
    costo: '280.00',
    precio: '380.00',
    stockInicial: '4',
  },
  {
    codigo: 'BAT-15PL',
    nombre: 'Batería 15 placas',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Etna',
    stockMinimo: '2',
    costo: '330.00',
    precio: '450.00',
    stockInicial: '3',
  },
  {
    codigo: 'FOCO-H4',
    nombre: 'Foco halógeno H4 12 V',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Philips',
    stockMinimo: '4',
    costo: '12.00',
    precio: '22.00',
    stockInicial: '10',
  },
  // Fajas, suspensión y transmisión
  {
    codigo: 'FAJA-ACC',
    nombre: 'Faja de accesorios',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Gates',
    stockMinimo: '2',
    costo: '45.00',
    precio: '80.00',
    stockInicial: '5',
  },
  {
    codigo: 'KIT-DIST',
    nombre: 'Kit de distribución (faja y tensor)',
    tipo: REPUESTO,
    unidad: KIT,
    marca: 'Gates',
    stockMinimo: '1',
    costo: '280.00',
    precio: '420.00',
    stockInicial: '2',
  },
  {
    codigo: 'AMORT-DEL',
    nombre: 'Amortiguador delantero',
    tipo: REPUESTO,
    unidad: UNIDAD,
    marca: 'Monroe',
    stockMinimo: '2',
    costo: '150.00',
    precio: '230.00',
    stockInicial: '4',
  },
  // Insumos de limpieza y lubricación
  {
    codigo: 'LIMP-INY',
    nombre: 'Limpiador de inyectores (frasco)',
    tipo: INSUMO,
    unidad: UNIDAD,
    marca: 'Wurth',
    stockMinimo: '3',
    costo: '18.00',
    precio: '32.00',
    stockInicial: '10',
  },
  {
    codigo: 'LIMP-CUERPO-ACEL',
    nombre: 'Limpiador de cuerpo de aceleración (spray)',
    tipo: INSUMO,
    unidad: UNIDAD,
    marca: 'Wurth',
    stockMinimo: '3',
    costo: '15.00',
    precio: '28.00',
    stockInicial: '10',
  },
  {
    codigo: 'GRASA-MULTI',
    nombre: 'Grasa multipropósito (500 g)',
    tipo: INSUMO,
    unidad: UNIDAD,
    marca: 'Shell',
    stockMinimo: '2',
    costo: '12.00',
    precio: '20.00',
    stockInicial: '6',
  },
];

export async function seedInventory(prisma: PrismaClient) {
  // La compra inicial necesita autor: el administrador sembrado.
  const correo = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const admin = correo
    ? await prisma.usuario.findUnique({
        where: { correo },
        select: { usuarioId: true },
      })
    : null;
  if (!admin) {
    console.log(
      'Sin administrador: los productos nuevos se crean con stock 0, sin compra inicial.',
    );
  }

  let created = 0;
  for (const { stockInicial, ...product } of PRODUCTS) {
    const existing = await prisma.producto.findUnique({
      where: { codigo: product.codigo },
      select: { productoId: true },
    });
    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      const { productoId } = await tx.producto.create({
        data: { ...product, stock: admin ? stockInicial : '0' },
        select: { productoId: true },
      });
      if (admin) {
        await tx.movimientoStock.create({
          data: {
            productoId,
            tipo: TipoMovimiento.COMPRA,
            cantidad: stockInicial,
            costoUnitario: product.costo,
            nota: 'Stock inicial del taller',
            creadoPorId: admin.usuarioId,
          },
        });
      }
    });
    created++;
  }
  console.log(
    `Repuestos e insumos: ${created} nuevos de ${PRODUCTS.length} base.`,
  );
}
