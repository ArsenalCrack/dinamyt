-- Un PIN de check-in para cada quien, sin que el maestro lo teclee.
--
-- El PIN es el plan B del carnet QR: la cámara no lee, el alumno olvidó el
-- carnet, el celular se quedó sin batería. Hasta aquí lo escribía el maestro a
-- mano en la ficha, así que en la práctica casi nadie tenía uno y el plan B no
-- existía.
--
-- De aquí en adelante lo genera la API al crear la membresía (ver
-- `ensureMembership` en `apps/membresias-api/src/lib/memberships.ts`). Esto
-- rellena a los que ya estaban.
--
-- Por qué un bucle y no un `update` de una sola pasada: el PIN identifica a una
-- persona DENTRO de su club (`routes/checkin.ts` lo busca por `org_id` +
-- `checkin_pin`), así que dos alumnos del mismo club con el mismo PIN harían
-- que uno marcara la asistencia del otro. Se sortea y se comprueba, uno a uno.
--
-- Cuatro dígitos dan 10 000 combinaciones: de sobra para un club, y si alguno
-- llegara a llenarse el sorteo pasa a seis en vez de quedarse dando vueltas.
DO $$
DECLARE
  fila record;
  candidato text;
  intentos int;
BEGIN
  FOR fila IN
    SELECT id, org_id FROM membresias.memberships
    WHERE checkin_pin IS NULL OR checkin_pin = ''
  LOOP
    intentos := 0;
    LOOP
      candidato := lpad(
        floor(random() * CASE WHEN intentos < 20 THEN 10000 ELSE 1000000 END)::int::text,
        CASE WHEN intentos < 20 THEN 4 ELSE 6 END,
        '0'
      );
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM membresias.memberships
        WHERE org_id = fila.org_id AND checkin_pin = candidato
      );
      intentos := intentos + 1;
    END LOOP;
    UPDATE membresias.memberships SET checkin_pin = candidato WHERE id = fila.id;
  END LOOP;
END $$;
