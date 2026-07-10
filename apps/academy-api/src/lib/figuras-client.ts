/**
 * Cliente del microservicio de figuras (apps/academy-figuras, FastAPI :3009).
 * Corre en la MISMA máquina que esta API: se intercambian rutas de archivo
 * dentro del almacén compartido (`config.uploadsDir`), no bytes.
 * Inyectable en `buildApp` para simularlo en tests.
 */

export interface MomentoCorreccion {
  /** Segundos dentro del video del estudiante. */
  time: number;
  /** Marca legible mm:ss. */
  label: string;
  /** Ruta relativa (en uploads) de la imagen comparativa alumno|referencia. */
  image: string | null;
  /** Desvío máximo del segmento en grados. */
  maxDiff: number;
}

export interface CorreccionFigura {
  joint: string;
  jointLabel: string;
  message: string;
  avgDiff: number;
  momentos: MomentoCorreccion[];
}

export interface ResultadoFigura {
  overallScore: number; // 0-100
  qualityLabel: string;
  detectionRate: number;
  warning?: string | null;
  joints: Record<string, { score: number; avgDiff: number; quality: string }>;
  corrections: CorreccionFigura[];
  reportImg: string | null;
  annotatedVideo: string | null;
}

export interface FigurasClient {
  /** Extrae pose/ángulos de una referencia y los persiste como .npz. */
  extract(videoPath: string, anglesPath: string): Promise<{ detectionRate: number }>;
  /** Compara el video del estudiante contra la referencia precalculada. */
  compare(args: {
    studentVideoPath: string;
    referenceVideoPath: string;
    referenceAnglesPath: string;
    outDir: string;
  }): Promise<ResultadoFigura>;
}

export function createHttpFigurasClient(baseUrl: string): FigurasClient {
  async function post<T>(ruta: string, body: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const texto = await res.text().catch(() => '');
      throw new Error(`figuras-service ${ruta} → ${res.status}: ${texto.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }
  return {
    extract: (videoPath, anglesPath) =>
      post('/extract', { video_path: videoPath, angles_path: anglesPath }),
    compare: (args) =>
      post('/compare', {
        student_video_path: args.studentVideoPath,
        reference_video_path: args.referenceVideoPath,
        reference_angles_path: args.referenceAnglesPath,
        out_dir: args.outDir,
      }),
  };
}
