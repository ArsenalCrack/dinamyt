import { pedirSupresionAAcademy } from './espejo-academy';

describe('pedirSupresionAAcademy', () => {
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
    delete process.env.SYNC_SECRET_ACADEMY;
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    delete process.env.ACADEMY_SYNC_URL;
  });

  afterAll(() => {
    process.env = entorno;
    global.fetch = fetchOriginal;
  });

  it('sin dirección o sin secreto no pregunta: sin-espejo', async () => {
    responder(200);
    process.env.SYNC_SECRET_ACADEMY = 's';
    await expect(pedirSupresionAAcademy(ANA)).resolves.toBe('sin-espejo');
    delete process.env.SYNC_SECRET_ACADEMY;
    process.env.ACADEMY_SYNC_URL = 'http://127.0.0.1:3007';
    await expect(pedirSupresionAAcademy(ANA)).resolves.toBe('sin-espejo');
    expect(llamadas).toHaveLength(0);
  });

  it('firma con el secreto de Academy y manda solo el id', async () => {
    responder(200);
    process.env.ACADEMY_SYNC_URL = 'http://127.0.0.1:3007/';
    process.env.SYNC_SECRET_ACADEMY = 'el-de-academy';
    process.env.ECOSYSTEM_SYNC_SECRET = 'el-compartido';
    await expect(pedirSupresionAAcademy(ANA)).resolves.toBe('hecha');
    expect(llamadas[0].url).toBe('http://127.0.0.1:3007/sync/supresion');
    expect((llamadas[0].init.headers as Record<string, string>)['x-dinamyt-sync']).toBe('el-de-academy');
    expect(JSON.parse(llamadas[0].init.body as string)).toEqual({ ecoSub: ANA });
  });

  it('un error de Academy, o que no conteste, es fallo', async () => {
    process.env.ACADEMY_SYNC_URL = 'http://127.0.0.1:3007';
    process.env.ECOSYSTEM_SYNC_SECRET = 'el-compartido';
    responder(404);
    await expect(pedirSupresionAAcademy(ANA)).resolves.toBe('fallo');
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(pedirSupresionAAcademy(ANA)).resolves.toBe('fallo');
  });
});
