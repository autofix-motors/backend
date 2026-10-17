import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  ProductKind,
  StockMovementType,
  UnitOfMeasure,
} from '../../src/generated/prisma/enums.js';

// Los repuestos, insumos y herramientas con que arranca el taller. Costos y
// precios son una estimación del mercado de Lima (2026), con un margen de 35 a
// 50 %: sirven de punto de partida y el administrador los ajusta.
//
// El stock inicial no se escribe a mano en el producto: entra como una compra
// en el kardex (PURCHASE, con su costo), igual que entraría desde la pantalla,
// para que el stock sea siempre la suma de sus movimientos. Se registra solo
// cuando el producto se crea: volver a sembrar no duplica stock ni pisa lo que
// el taller ya cambió (`update: {}`).

interface SeedProduct {
  code: string;
  name: string;
  kind: ProductKind;
  unit: UnitOfMeasure;
  brand: string;
  minStock: string;
  cost: string;
  price: string;
  /** El stock con que arranca, como compra inicial. */
  initialStock: string;
}

const { PART, SUPPLY } = ProductKind;
const { UNIT, LITER, GALLON, KIT } = UnitOfMeasure;

const PRODUCTS: SeedProduct[] = [
  // Aceites y fluidos
  {
    code: 'ACE-5W30-GAL',
    name: 'Aceite sintético 5W-30 (galón)',
    kind: SUPPLY,
    unit: GALLON,
    brand: 'Castrol Magnatec',
    minStock: '4',
    cost: '95.00',
    price: '135.00',
    initialStock: '12',
  },
  {
    code: 'ACE-20W50-GAL',
    name: 'Aceite mineral 20W-50 (galón)',
    kind: SUPPLY,
    unit: GALLON,
    brand: 'Mobil Super',
    minStock: '4',
    cost: '70.00',
    price: '100.00',
    initialStock: '10',
  },
  {
    code: 'ACE-10W40-LT',
    name: 'Aceite semisintético 10W-40 (litro)',
    kind: SUPPLY,
    unit: LITER,
    brand: 'Shell Helix HX7',
    minStock: '8',
    cost: '28.00',
    price: '40.00',
    initialStock: '24',
  },
  {
    code: 'ATF-DEX3-LT',
    name: 'Aceite de transmisión automática ATF Dexron III (litro)',
    kind: SUPPLY,
    unit: LITER,
    brand: 'Valvoline',
    minStock: '4',
    cost: '25.00',
    price: '38.00',
    initialStock: '12',
  },
  {
    code: 'LIQ-FRENO-DOT4',
    name: 'Líquido de frenos DOT 4 (500 ml)',
    kind: SUPPLY,
    unit: UNIT,
    brand: 'Bosch',
    minStock: '4',
    cost: '18.00',
    price: '30.00',
    initialStock: '10',
  },
  {
    code: 'REF-VERDE-GAL',
    name: 'Refrigerante listo para usar (galón)',
    kind: SUPPLY,
    unit: GALLON,
    brand: 'Prestone',
    minStock: '3',
    cost: '25.00',
    price: '40.00',
    initialStock: '8',
  },
  {
    code: 'GAS-R134A',
    name: 'Gas refrigerante R134a (lata)',
    kind: SUPPLY,
    unit: UNIT,
    brand: 'Genetron',
    minStock: '2',
    cost: '60.00',
    price: '100.00',
    initialStock: '6',
  },
  // Filtros
  {
    code: 'FA-TOY-90915',
    name: 'Filtro de aceite Toyota (Yaris, Corolla, Hilux)',
    kind: PART,
    unit: UNIT,
    brand: 'Toyota',
    minStock: '5',
    cost: '15.00',
    price: '28.00',
    initialStock: '15',
  },
  {
    code: 'FA-HYU-26300',
    name: 'Filtro de aceite Hyundai/Kia (Accent, Rio)',
    kind: PART,
    unit: UNIT,
    brand: 'Hyundai',
    minStock: '5',
    cost: '16.00',
    price: '30.00',
    initialStock: '15',
  },
  {
    code: 'FAI-TOY-YARIS',
    name: 'Filtro de aire Toyota Yaris',
    kind: PART,
    unit: UNIT,
    brand: 'Toyota',
    minStock: '3',
    cost: '25.00',
    price: '45.00',
    initialStock: '8',
  },
  {
    code: 'FAI-HYU-ACCENT',
    name: 'Filtro de aire Hyundai Accent',
    kind: PART,
    unit: UNIT,
    brand: 'Hyundai',
    minStock: '3',
    cost: '25.00',
    price: '45.00',
    initialStock: '8',
  },
  {
    code: 'FCAB-UNIV',
    name: 'Filtro de cabina (aire acondicionado)',
    kind: PART,
    unit: UNIT,
    brand: 'Bosch',
    minStock: '3',
    cost: '20.00',
    price: '38.00',
    initialStock: '8',
  },
  {
    code: 'FCOMB-UNIV',
    name: 'Filtro de combustible',
    kind: PART,
    unit: UNIT,
    brand: 'Bosch',
    minStock: '3',
    cost: '25.00',
    price: '45.00',
    initialStock: '6',
  },
  // Frenos
  {
    code: 'PAS-DEL-YARIS',
    name: 'Pastillas de freno delanteras Toyota Yaris (juego)',
    kind: PART,
    unit: KIT,
    brand: 'Bosch',
    minStock: '2',
    cost: '70.00',
    price: '120.00',
    initialStock: '6',
  },
  {
    code: 'PAS-DEL-ACCENT',
    name: 'Pastillas de freno delanteras Hyundai Accent (juego)',
    kind: PART,
    unit: KIT,
    brand: 'Bosch',
    minStock: '2',
    cost: '70.00',
    price: '120.00',
    initialStock: '6',
  },
  // Encendido y eléctrico
  {
    code: 'BUJ-NGK-IRID',
    name: 'Bujía de iridio',
    kind: PART,
    unit: UNIT,
    brand: 'NGK',
    minStock: '8',
    cost: '35.00',
    price: '55.00',
    initialStock: '24',
  },
  {
    code: 'BUJ-NGK-STD',
    name: 'Bujía estándar',
    kind: PART,
    unit: UNIT,
    brand: 'NGK',
    minStock: '8',
    cost: '10.00',
    price: '18.00',
    initialStock: '24',
  },
  {
    code: 'BAT-13PL',
    name: 'Batería 13 placas',
    kind: PART,
    unit: UNIT,
    brand: 'Etna',
    minStock: '2',
    cost: '280.00',
    price: '380.00',
    initialStock: '4',
  },
  {
    code: 'BAT-15PL',
    name: 'Batería 15 placas',
    kind: PART,
    unit: UNIT,
    brand: 'Etna',
    minStock: '2',
    cost: '330.00',
    price: '450.00',
    initialStock: '3',
  },
  {
    code: 'FOCO-H4',
    name: 'Foco halógeno H4 12 V',
    kind: PART,
    unit: UNIT,
    brand: 'Philips',
    minStock: '4',
    cost: '12.00',
    price: '22.00',
    initialStock: '10',
  },
  // Fajas, suspensión y transmisión
  {
    code: 'FAJA-ACC',
    name: 'Faja de accesorios',
    kind: PART,
    unit: UNIT,
    brand: 'Gates',
    minStock: '2',
    cost: '45.00',
    price: '80.00',
    initialStock: '5',
  },
  {
    code: 'KIT-DIST',
    name: 'Kit de distribución (faja y tensor)',
    kind: PART,
    unit: KIT,
    brand: 'Gates',
    minStock: '1',
    cost: '280.00',
    price: '420.00',
    initialStock: '2',
  },
  {
    code: 'AMORT-DEL',
    name: 'Amortiguador delantero',
    kind: PART,
    unit: UNIT,
    brand: 'Monroe',
    minStock: '2',
    cost: '150.00',
    price: '230.00',
    initialStock: '4',
  },
  // Insumos de limpieza y lubricación
  {
    code: 'LIMP-INY',
    name: 'Limpiador de inyectores (frasco)',
    kind: SUPPLY,
    unit: UNIT,
    brand: 'Wurth',
    minStock: '3',
    cost: '18.00',
    price: '32.00',
    initialStock: '10',
  },
  {
    code: 'LIMP-CUERPO-ACEL',
    name: 'Limpiador de cuerpo de aceleración (spray)',
    kind: SUPPLY,
    unit: UNIT,
    brand: 'Wurth',
    minStock: '3',
    cost: '15.00',
    price: '28.00',
    initialStock: '10',
  },
  {
    code: 'GRASA-MULTI',
    name: 'Grasa multipropósito (500 g)',
    kind: SUPPLY,
    unit: UNIT,
    brand: 'Shell',
    minStock: '2',
    cost: '12.00',
    price: '20.00',
    initialStock: '6',
  },
];

interface SeedTool {
  code: string;
  name: string;
  brand: string;
}

const TOOLS: SeedTool[] = [
  {
    code: 'HER-GATA-3T',
    name: 'Gata hidráulica de patín 3 t',
    brand: 'Truper',
  },
  {
    code: 'HER-TORRES-3T',
    name: 'Torres de soporte 3 t (par)',
    brand: 'Truper',
  },
  {
    code: 'HER-ESCANER-OBD2',
    name: 'Escáner automotriz OBD2',
    brand: 'Launch',
  },
  { code: 'HER-TORQ-12', name: 'Torquímetro de 1/2"', brand: 'Stanley' },
  { code: 'HER-DADOS-12', name: 'Juego de dados de 1/2"', brand: 'Stanley' },
  { code: 'HER-MULTIMETRO', name: 'Multímetro digital', brand: 'Fluke' },
  {
    code: 'HER-COMPRESOR-50L',
    name: 'Compresor de aire 50 L',
    brand: 'Pretul',
  },
  {
    code: 'HER-PIST-IMPACTO',
    name: 'Pistola de impacto neumática 1/2"',
    brand: 'Ingersoll Rand',
  },
  {
    code: 'HER-ELEVADOR-2C',
    name: 'Elevador de dos columnas',
    brand: 'Launch',
  },
  {
    code: 'HER-EXTR-FILTROS',
    name: 'Extractor de filtros de aceite',
    brand: 'Truper',
  },
  { code: 'HER-PROB-BATERIA', name: 'Probador de baterías', brand: 'Bosch' },
];

export async function seedInventory(prisma: PrismaClient) {
  // La compra inicial necesita autor: el administrador sembrado.
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const admin = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { userId: true },
      })
    : null;
  if (!admin) {
    console.log(
      'Sin administrador: los productos nuevos se crean con stock 0, sin compra inicial.',
    );
  }

  let created = 0;
  for (const { initialStock, ...product } of PRODUCTS) {
    const existing = await prisma.product.findUnique({
      where: { code: product.code },
      select: { productId: true },
    });
    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      const { productId } = await tx.product.create({
        data: { ...product, stock: admin ? initialStock : '0' },
        select: { productId: true },
      });
      if (admin) {
        await tx.stockMovement.create({
          data: {
            productId,
            type: StockMovementType.PURCHASE,
            quantity: initialStock,
            unitCost: product.cost,
            note: 'Stock inicial del taller',
            createdById: admin.userId,
          },
        });
      }
    });
    created++;
  }
  console.log(
    `Repuestos e insumos: ${created} nuevos de ${PRODUCTS.length} base.`,
  );

  for (const tool of TOOLS) {
    await prisma.tool.upsert({
      where: { code: tool.code },
      create: tool,
      update: {},
    });
  }
  console.log(`Herramientas: ${TOOLS.length} base.`);
}
