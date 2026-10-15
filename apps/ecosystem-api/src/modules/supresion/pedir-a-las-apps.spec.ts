import { APPS_QUE_BORRAN, pedirSupresion } from './pedir-a-las-apps';

describe('pedirSupresion', () => {
  const ANA = '00000000-0000-0000-0000-0000000000aa';
  const entorno = { ...process.env };
  const fetchOriginal = global.fetch;
  let llamadas: { url: string; init: RequestInit }[];

  const responder = (status: number) => {
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return new Response(null, { status });
    }) as unknown as typeof fetch;
  };

  beforeEach(() => {
    llamadas = [];
    process.env = { ...entorno };
    for (const v of [
      'ECOSYSTEM_SYNC_SECRET',
      'SYNC_SECRET_MEMBRESIAS',
      'SYNC_SECRET_CAMPEONATOS',
      'SYNC_SECRET_ACADEMY',
      ...APPS_QUE_BORRAN.map((a) => a.variable),
    ]) {
      delete process.env[v];
    }
  });

  afterAll(() => {
    process.env = entorno;
    global.fetch = fetchOriginal;
  });

  describe.each(APPS_QUE_BORRAN.map((a) => [a.nombre, a] as const))('%s', (_nombre, destino) => {
    const propio = `SYNC_SECRET_${destino.app.toUpperCase()}`;

    it('sin dirección o sin secreto no pregunta: sin-espejo', async () => {
      responder(200);
      process.env[propio] = 's';
      await expect(pedirSupresion(destino, ANA)).resolves.toBe('sin-espejo');
      delete process.env[propio];
      process.env[destino.variable] = 'http://127.0.0.1:9';
      await expect(pedirSupresion(destino, ANA)).resolves.toBe('sin-espejo');
      expect(llamadas).toHaveLength(0);
    });

    it('firma con el secreto propio y manda solo el id', async () => {
      responder(200);
      process.env[destino.variable] = 'http://127.0.0.1:9/';
      process.env[propio] = 'el-propio';
      process.env.ECOSYSTEM_SYNC_SECRET = 'el-compartido';
      await expect(pedirSupresion(destino, ANA)).resolves.toBe('hecha');
      expect(llamadas[0].url).toBe(`http://127.0.0.1:9${destino.ruta}`);
      const cabeceras = llamadas[0].init.headers as Record<string, string>;
      expect(cabeceras['x-dinamyt-sync']).toBe('el-propio');
      expect(JSON.parse(llamadas[0].init.body as string)).toEqual({ ecoSub: ANA });
    });

    it('un error de la app, o que no conteste, es fallo', async () => {
      process.env[destino.variable] = 'http://127.0.0.1:9';
      process.env.ECOSYSTEM_SYNC_SECRET = 'el-compartido';
      responder(404);
      await expect(pedirSupresion(destino, ANA)).resolves.toBe('fallo');
      global.fetch = jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;
      await expect(pedirSupresion(destino, ANA)).resolves.toBe('fallo');
    });
  });
});
