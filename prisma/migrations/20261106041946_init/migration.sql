-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMINISTRADOR', 'MECANICO');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('DNI', 'RUC', 'CE', 'PASAPORTE');

-- CreateEnum
CREATE TYPE "TipoProducto" AS ENUM ('REPUESTO', 'INSUMO');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('UNIDAD', 'LITRO', 'GALON', 'KIT', 'METRO');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('COMPRA', 'ORDEN_TRABAJO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('RECIBIDO', 'EN_DIAGNOSTICO', 'ESPERANDO_APROBACION', 'EN_REPARACION', 'ESPERANDO_REPUESTOS', 'LISTO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoDetalle" AS ENUM ('SERVICIO', 'PRODUCTO');

-- CreateEnum
CREATE TYPE "EstadoPresupuesto" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'REEMPLAZADO');

-- CreateEnum
CREATE TYPE "CanalDecision" AS ENUM ('TELEFONO', 'WHATSAPP', 'EN_PERSONA', 'PORTAL');

-- CreateTable
CREATE TABLE "usuario" (
    "usuario_id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "numero_documento" VARCHAR(8),
    "nombre" TEXT NOT NULL,
    "telefono" VARCHAR(20),
    "rol" "RolUsuario" NOT NULL DEFAULT 'MECANICO',
    "hash_contrasena" TEXT,
    "debe_cambiar_contrasena" BOOLEAN NOT NULL DEFAULT false,
    "contrasena_expira_en" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_ingreso_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "sesion_id" UUID NOT NULL,
    "usuario_id" UUID,
    "cuenta_cliente_id" UUID,
    "hash_token" CHAR(64) NOT NULL,
    "familia_id" UUID NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "revocada_en" TIMESTAMP(3),
    "reemplazada_por_id" UUID,
    "ip" VARCHAR(45),
    "agente_usuario" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("sesion_id")
);

-- CreateTable
CREATE TABLE "cuenta_cliente" (
    "cuenta_cliente_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "hash_contrasena" TEXT NOT NULL,
    "debe_cambiar_contrasena" BOOLEAN NOT NULL DEFAULT true,
    "contrasena_expira_en" TIMESTAMP(3),
    "ultimo_ingreso_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuenta_cliente_pkey" PRIMARY KEY ("cuenta_cliente_id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "cliente_id" UUID NOT NULL,
    "tipo_documento" "TipoDocumento" NOT NULL,
    "numero_documento" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "correo" VARCHAR(254),
    "direccion" VARCHAR(250),
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("cliente_id")
);

-- CreateTable
CREATE TABLE "vehiculo" (
    "vehiculo_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "placa" VARCHAR(10) NOT NULL,
    "marca" VARCHAR(60) NOT NULL,
    "modelo" VARCHAR(60) NOT NULL,
    "anio" INTEGER,
    "color" VARCHAR(40),
    "vin" VARCHAR(17),
    "notas" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehiculo_pkey" PRIMARY KEY ("vehiculo_id")
);

-- CreateTable
CREATE TABLE "producto" (
    "producto_id" UUID NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "tipo" "TipoProducto" NOT NULL,
    "unidad" "UnidadMedida" NOT NULL,
    "marca" VARCHAR(60),
    "stock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costo" DECIMAL(10,2) NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("producto_id")
);

-- CreateTable
CREATE TABLE "movimiento_stock" (
    "movimiento_stock_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "costo_unitario" DECIMAL(10,2),
    "detalle_orden_id" UUID,
    "nota" TEXT,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_stock_pkey" PRIMARY KEY ("movimiento_stock_id")
);

-- CreateTable
CREATE TABLE "servicio" (
    "servicio_id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" TEXT,
    "precio_mano_obra" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicio_pkey" PRIMARY KEY ("servicio_id")
);

-- CreateTable
CREATE TABLE "orden_trabajo" (
    "orden_trabajo_id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "codigo_seguimiento" VARCHAR(12) NOT NULL,
    "cliente_id" UUID NOT NULL,
    "vehiculo_id" UUID NOT NULL,
    "mecanico_id" UUID,
    "creado_por_id" UUID NOT NULL,
    "estado" "EstadoOrden" NOT NULL DEFAULT 'RECIBIDO',
    "kilometraje_ingreso" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "diagnostico" TEXT,
    "fecha_prometida" DATE,
    "recibida_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entregada_en" TIMESTAMP(3),
    "cancelada_en" TIMESTAMP(3),
    "motivo_cancelacion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orden_trabajo_pkey" PRIMARY KEY ("orden_trabajo_id")
);

-- CreateTable
CREATE TABLE "evento_orden" (
    "evento_orden_id" UUID NOT NULL,
    "orden_trabajo_id" UUID NOT NULL,
    "estado" "EstadoOrden",
    "nota" TEXT,
    "es_publico" BOOLEAN NOT NULL DEFAULT false,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_orden_pkey" PRIMARY KEY ("evento_orden_id")
);

-- CreateTable
CREATE TABLE "detalle_orden" (
    "detalle_orden_id" UUID NOT NULL,
    "orden_trabajo_id" UUID NOT NULL,
    "tipo" "TipoDetalle" NOT NULL,
    "servicio_id" UUID,
    "producto_id" UUID,
    "descripcion" VARCHAR(200) NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "costo_unitario" DECIMAL(10,2),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "detalle_orden_pkey" PRIMARY KEY ("detalle_orden_id")
);

-- CreateTable
CREATE TABLE "presupuesto" (
    "presupuesto_id" UUID NOT NULL,
    "orden_trabajo_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" "EstadoPresupuesto" NOT NULL DEFAULT 'PENDIENTE',
    "total" DECIMAL(10,2) NOT NULL,
    "enviado_por_id" UUID NOT NULL,
    "enviado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidido_por_id" UUID,
    "decidido_en" TIMESTAMP(3),
    "canal_decision" "CanalDecision",
    "nota_decision" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presupuesto_pkey" PRIMARY KEY ("presupuesto_id")
);

-- CreateTable
CREATE TABLE "detalle_presupuesto" (
    "detalle_presupuesto_id" UUID NOT NULL,
    "presupuesto_id" UUID NOT NULL,
    "tipo" "TipoDetalle" NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detalle_presupuesto_pkey" PRIMARY KEY ("detalle_presupuesto_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_numero_documento_key" ON "usuario"("numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_hash_token_key" ON "sesion"("hash_token");

-- CreateIndex
CREATE INDEX "sesion_usuario_id_idx" ON "sesion"("usuario_id");

-- CreateIndex
CREATE INDEX "sesion_cuenta_cliente_id_idx" ON "sesion"("cuenta_cliente_id");

-- CreateIndex
CREATE INDEX "sesion_familia_id_idx" ON "sesion"("familia_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_cliente_cliente_id_key" ON "cuenta_cliente"("cliente_id");

-- CreateIndex
CREATE INDEX "cliente_nombre_idx" ON "cliente"("nombre");

-- CreateIndex
CREATE INDEX "cliente_telefono_idx" ON "cliente"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_tipo_documento_numero_documento_key" ON "cliente"("tipo_documento", "numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculo_placa_key" ON "vehiculo"("placa");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculo_vin_key" ON "vehiculo"("vin");

-- CreateIndex
CREATE INDEX "vehiculo_cliente_id_idx" ON "vehiculo"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "producto_codigo_key" ON "producto"("codigo");

-- CreateIndex
CREATE INDEX "producto_nombre_idx" ON "producto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_stock_detalle_orden_id_key" ON "movimiento_stock"("detalle_orden_id");

-- CreateIndex
CREATE INDEX "movimiento_stock_producto_id_creado_en_idx" ON "movimiento_stock"("producto_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "servicio_nombre_key" ON "servicio"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "orden_trabajo_numero_key" ON "orden_trabajo"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "orden_trabajo_codigo_seguimiento_key" ON "orden_trabajo"("codigo_seguimiento");

-- CreateIndex
CREATE INDEX "orden_trabajo_estado_idx" ON "orden_trabajo"("estado");

-- CreateIndex
CREATE INDEX "orden_trabajo_mecanico_id_idx" ON "orden_trabajo"("mecanico_id");

-- CreateIndex
CREATE INDEX "orden_trabajo_vehiculo_id_idx" ON "orden_trabajo"("vehiculo_id");

-- CreateIndex
CREATE INDEX "orden_trabajo_cliente_id_idx" ON "orden_trabajo"("cliente_id");

-- CreateIndex
CREATE INDEX "evento_orden_orden_trabajo_id_creado_en_idx" ON "evento_orden"("orden_trabajo_id", "creado_en");

-- CreateIndex
CREATE INDEX "detalle_orden_orden_trabajo_id_idx" ON "detalle_orden"("orden_trabajo_id");

-- CreateIndex
CREATE INDEX "detalle_orden_producto_id_idx" ON "detalle_orden"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "presupuesto_orden_trabajo_id_version_key" ON "presupuesto"("orden_trabajo_id", "version");

-- CreateIndex
CREATE INDEX "detalle_presupuesto_presupuesto_id_idx" ON "detalle_presupuesto"("presupuesto_id");

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("usuario_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_cuenta_cliente_id_fkey" FOREIGN KEY ("cuenta_cliente_id") REFERENCES "cuenta_cliente"("cuenta_cliente_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_cliente" ADD CONSTRAINT "cuenta_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("cliente_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculo" ADD CONSTRAINT "vehiculo_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("cliente_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("producto_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_detalle_orden_id_fkey" FOREIGN KEY ("detalle_orden_id") REFERENCES "detalle_orden"("detalle_orden_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("cliente_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculo"("vehiculo_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_mecanico_id_fkey" FOREIGN KEY ("mecanico_id") REFERENCES "usuario"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_orden" ADD CONSTRAINT "evento_orden_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "orden_trabajo"("orden_trabajo_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_orden" ADD CONSTRAINT "evento_orden_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_orden" ADD CONSTRAINT "detalle_orden_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "orden_trabajo"("orden_trabajo_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_orden" ADD CONSTRAINT "detalle_orden_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicio"("servicio_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_orden" ADD CONSTRAINT "detalle_orden_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("producto_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto" ADD CONSTRAINT "presupuesto_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "orden_trabajo"("orden_trabajo_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto" ADD CONSTRAINT "presupuesto_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuario"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto" ADD CONSTRAINT "presupuesto_decidido_por_id_fkey" FOREIGN KEY ("decidido_por_id") REFERENCES "usuario"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_presupuesto" ADD CONSTRAINT "detalle_presupuesto_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuesto"("presupuesto_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Una sesión es de un usuario del personal o de la cuenta de un cliente: nunca
-- de los dos ni de ninguno. Prisma no puede declarar este CHECK: lo documenta
-- el `///` de Sesion.
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_dueno_check"
    CHECK (num_nonnulls("usuario_id", "cuenta_cliente_id") = 1);
