import type { FastifyInstance } from 'fastify';
import { Country, City } from 'country-state-city';

/**
 * Catálogo geográfico para los formularios (país / ciudad): todos los países
 * ISO-3166 y todas sus ciudades.
 *
 * Vive en el servidor a propósito: el dataset de `country-state-city` pesa
 * megabytes y meterlo en el bundle del navegador haría que la app tardara en
 * abrir para todo el mundo, cuando esto solo lo usa el superadmin al crear un
 * club. El front pinta el nombre del país en el idioma activo con
 * `Intl.DisplayNames` a partir del iso2.
 *
 * Público: no expone un solo dato del club ni de sus alumnos, y es lo mismo
 * que responde una lista ISO. Se cachea un día en el navegador porque no
 * cambia nunca.
 */
export async function geoRoutes(app: FastifyInstance) {
  app.get('/geo/paises', async (_req, reply) => {
    const paises = Country.getAllCountries().map((c) => ({
      iso2: c.isoCode,
      nombre: c.name,
    }));
    return reply.header('cache-control', 'public, max-age=86400').send(paises);
  });

  app.get('/geo/ciudades', async (req, reply) => {
    const { pais } = req.query as { pais?: string };
    if (!pais || !/^[A-Za-z]{2}$/.test(pais)) {
      return reply.code(400).send({ error: 'Parámetro "pais" (iso2) requerido.' });
    }
    const ciudades = (City.getCitiesOfCountry(pais.toUpperCase()) ?? []).map(
      (c) => c.name,
    );
    // El dataset repite nombres entre estados: se deduplica conservando el orden.
    const unicas = [...new Set(ciudades)];
    return reply.header('cache-control', 'public, max-age=86400').send(unicas);
  });
}
