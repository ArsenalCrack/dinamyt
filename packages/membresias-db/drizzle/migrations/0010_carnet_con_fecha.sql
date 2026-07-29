-- El carnet estrena fecha de expedición, y con ella un vencimiento de verdad.
--
-- Hasta aquí el carnet no guardaba NINGUNA fecha: la vista previa calculaba
-- «emitido hoy, vence dentro de un año» en el navegador, en el momento de
-- imprimir. Eso tenía dos consecuencias, y las dos son errores:
--
-- 1. El carnet no vencía nunca. Volver a imprimirlo era, en la práctica,
--    renovarlo por otro año; nadie tenía que renovar nada.
-- 2. Dos copias del mismo carnet decían cosas distintas. El que se imprimió en
--    marzo y el que se reimprimió en agosto no eran el mismo documento.
--
-- La fecha se rellena con la de alta de cada persona, que es lo más cercano a
-- «cuándo se le expidió su primer carnet» que se sabe de los que ya estaban.
-- De aquí en adelante la pone la API al crear la cuenta, y solo la mueve el
-- maestro al reexpedir el carnet (`POST /users/:id/carnet`).
--
-- El DEFAULT es la red de seguridad, no el camino normal: la API escribe la
-- fecha con la zona horaria del club (`todayStr`), mientras que CURRENT_DATE
-- usa la del servidor de base de datos, que no tiene por qué ser la misma.
ALTER TABLE "membresias"."users"
  ADD COLUMN "carnet_emitido_el" date NOT NULL DEFAULT CURRENT_DATE;--> statement-breakpoint
UPDATE "membresias"."users"
  SET "carnet_emitido_el" = "created_at"::date
  WHERE "created_at" IS NOT NULL;
