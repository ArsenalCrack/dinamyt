-- Qué periodo compra cada pago.
--
-- Hasta aquí un pago solo sabía CUÁNDO se recibió. Con eso, un alumno que paga
-- dos meses por adelantado en julio dejaba 160 000 en julio y nada en agosto, y
-- el panel del club leía el doble de lo esperado sin que nadie pudiera
-- explicarlo.
--
-- Estas tres columnas dicen qué compró el pago: cuántas mensualidades
-- (`periodos`) y entre qué fechas (`periodo_desde`, `periodo_hasta`). Con eso
-- el reporte separa la CAJA del mes —lo que entró— de lo DEVENGADO —lo que le
-- corresponde a ese mes—.
--
-- Los pagos que ya existen se quedan con `periodos = 1` y las fechas en nulo:
-- para el reporte cuentan enteros en el mes en que se recibieron, que es
-- exactamente como se contaban antes.
ALTER TABLE "membresias"."payments" ADD COLUMN "periodos" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "membresias"."payments" ADD COLUMN "periodo_desde" date;--> statement-breakpoint
ALTER TABLE "membresias"."payments" ADD COLUMN "periodo_hasta" date;
