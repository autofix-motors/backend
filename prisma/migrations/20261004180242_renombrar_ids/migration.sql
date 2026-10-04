-- La clave primaria de cada tabla se llama como su entidad (`user_id`, no `id`).
-- Se renombra en vez de borrar y crear la columna: así no se pierden los datos
-- ni las claves foráneas que ya apuntan a ella.

-- RenameColumn
ALTER TABLE "core_user" RENAME COLUMN "id" TO "user_id";

-- RenameColumn
ALTER TABLE "core_session" RENAME COLUMN "id" TO "session_id";
