import argon2 from 'argon2';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { UserRole } from '../../src/generated/prisma/enums.js';

// Lo que core necesita para arrancar: si el entorno lo pide, el primer
// administrador. Sin él nadie podría entrar, y para crear usuarios hay que
// haber entrado.

export async function seedCore(prisma: PrismaClient) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('Sin ADMIN_EMAIL y ADMIN_PASSWORD: no se crea administrador.');
    return;
  }
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD tiene que tener al menos 8 caracteres');
  }

  // Si el usuario ya existe no se toca: volver a sembrar no puede cambiarle la
  // contraseña a alguien que ya la cambió.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`El administrador ${email} ya existe: no se modifica.`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name: 'Administrador',
      role: UserRole.ADMIN,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
  });
  console.log(`Administrador ${email} creado.`);
}
