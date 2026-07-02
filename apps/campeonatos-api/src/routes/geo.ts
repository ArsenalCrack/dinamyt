import type { FastifyInstance } from 'fastify';
import { Country, City } from 'country-state-city';

/**
 * Catálogo geográfico para los formularios (país / ciudad): TODOS los países
 * ISO-3166 y TODAS sus ciudades (dataset de country-state-city, en el
 * servidor para no inflar el bundle del navegador). Público: no expone datos
 * del dominio. El front muestra el nombre del país en español con
 * Intl.DisplayNames a partir del iso2.
 */
export async function geoRoutes(app: FastifyInstance) {
  app.get('/geo/paises', async (_req, reply) => {
    const paises = Country.getAllCountries().map((c) => ({
      iso2: c.isoCode,
      nombre: c.name,
    }));
    // Catálogo estático: cachea agresivamente en el navegador.
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
    // Dedup (el dataset repite nombres entre estados) conservando el orden.
    const unicas = [...new Set(ciudades)];
    return reply.header('cache-control', 'public, max-age=86400').send(unicas);
  });
}
