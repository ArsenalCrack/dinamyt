import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db';
import { sessions } from '../../db/schema';

/**
 * Las sesiones abiertas del ecosistema.
 *
 * ── El problema que resuelve ───────────────────────────────────────────────
 *
 * Un JWT firmado vale hasta que caduca solo. Eso significaba que «cerrar
 * sesión» no cerraba nada: borraba la copia del navegador y el token original
 * seguía abriendo puertas durante veinticuatro horas. Alguien que entraba
 * desde un computador prestado y se iba dejaba su cuenta abierta ahí hasta el
 * día siguiente, y ni cerrar sesión ni cambiar la contraseña la cerraban.
 *
 * Aquí el token deja de SER la sesión y pasa a ser su PASE. La sesión es una
 * fila de esta tabla; el token lleva su `id` en el claim `jti` y no vale nada
 * si la fila está revocada, aunque la firma sea impecable.
 *
 * ── Los tres relojes ───────────────────────────────────────────────────────
 *
 * Una sesión muere por cualquiera de tres motivos, y hacen falta los tres:
 *
 *   · **Inactividad** (20 min). Es el que resuelve el computador prestado: la
 *     persona se levanta y se va, y a los veinte minutos ahí no queda nada.
 *   · **Máximo absoluto** (12 h). Sin él, quien toca la pantalla cada cuarto
 *     de hora no vuelve a escribir su contraseña jamás, y una sesión que no
 *     caduca nunca es una contraseña que nadie vuelve a comprobar.
 *   · **Revocación**. Explícita: salir, salir de todos lados, cambiar la
 *     contraseña, recuperarla, o que un administrador cierre la sesión.
 *
 * ── Por qué el pase dura 30 minutos ────────────────────────────────────────
 *
 * Academy y Campeonatos verifican la firma sin preguntarle nada a nadie, y eso
 * es lo que las hace rápidas e independientes. Si el pase durase un día, una
 * sesión revocada seguiría entrando en ellas todo ese día. Durando media hora,
 * el peor caso son treinta minutos y **no hay que tocar ni una línea de esas
 * apps**: el único que firma es el ecosystem, y cuando el navegador vuelve a
 * pedir un pase, aquí se comprueba la fila y se dice que no.
 */
@Injectable()
export class SessionsService {
  /** Lo que dura el PASE (el JWT). No es lo que dura la sesión. */
  static readonly PASE_SEGUNDOS = 30 * 60;

  /** Sin señales de vida durante esto, la sesión se cierra sola. */
  static readonly INACTIVIDAD_MINUTOS = 20;

  /** El techo: pase lo que pase, a las 12 horas hay que volver a entrar. */
  static readonly MAXIMO_HORAS = 12;

  /**
   * Cada cuánto se escribe `lastSeenAt` como mucho.
   *
   * Sin este freno, cada petición de cada pantalla sería un `UPDATE`: una
   * pantalla que carga ocho listas escribiría ocho veces en la misma fila para
   * decir lo mismo. Un minuto de resolución sobra cuando el corte está en
   * veinte.
   */
  static readonly LATIDO_SEGUNDOS = 60;

  /**
   * Cuánto se fía el guard de lo que ya comprobó.
   *
   * El guard consulta esta tabla en cada petición, y sin caché eso es un viaje
   * a la base por cada imagen y cada lista. Treinta segundos es corto frente a
   * los veinte minutos de inactividad y frente a la media hora del pase, así
   * que no alarga de forma apreciable la vida de una sesión revocada — y la
   * revocación además borra su propia entrada aquí mismo, así que en la
   * práctica es inmediata dentro de este proceso.
   */
  private static readonly CACHE_MS = 30_000;

  /**
   * Sesiones ya comprobadas: `jti` → hasta cuándo vale la comprobación.
   *
   * Vive en memoria y no se comparte entre procesos: es una caché, no un
   * registro. Si la API se reinicia o hay varias instancias, lo peor que pasa
   * es que se consulte la base de más, que es exactamente lo que hay que
   * preferir cuando lo que está en juego es dejar pasar a alguien.
   */
  private readonly comprobadas = new Map<string, number>();

  // ── Abrir ────────────────────────────────────────────────────────────────

  /** Abre una sesión y devuelve su id, que es el `jti` del pase. */
  async abrir(datos: {
    userId: string;
    userAgent?: string | null;
    ip?: string | null;
  }): Promise<{ id: string; expiresAt: Date }> {
    const expiresAt = new Date(
      Date.now() + SessionsService.MAXIMO_HORAS * 60 * 60 * 1000,
    );
    const [fila] = await db
      .insert(sessions)
      .values({
        userId: datos.userId,
        // Se recorta: el `User-Agent` lo escribe el cliente y puede venir tan
        // largo como quiera. La columna es `text`, pero guardar kilobytes de
        // cabecera por sesión no aporta nada a «¿desde qué navegador entré?».
        userAgent: datos.userAgent ? datos.userAgent.slice(0, 400) : null,
        ip: datos.ip ? datos.ip.slice(0, 60) : null,
        expiresAt,
      })
      .returning({ id: sessions.id, expiresAt: sessions.expiresAt });
    return { id: fila.id, expiresAt: fila.expiresAt };
  }

  // ── Comprobar ────────────────────────────────────────────────────────────

  /**
   * ¿Sigue viva esta sesión? Devuelve el motivo por el que no, si no.
   *
   * `tocar` distingue las dos formas de preguntar. Una petición normal es una
   * señal de vida y renueva el reloj de inactividad. Comprobar la sesión para
   * ENSEÑARLA en la lista de dispositivos no debería resucitarla, y sobre todo
   * no debería hacerlo la limpieza automática.
   */
  async validar(
    jti: string,
    tocar = true,
  ): Promise<{ viva: true } | { viva: false; motivo: MotivoCierre }> {
    const cacheado = this.comprobadas.get(jti);
    if (cacheado && cacheado > Date.now()) return { viva: true };

    const [s] = await db
      .select({
        id: sessions.id,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        revokedReason: sessions.revokedReason,
      })
      .from(sessions)
      .where(eq(sessions.id, jti))
      .limit(1);

    // Sin fila no hay sesión. Pasa cuando la cuenta se borró (la clave ajena
    // es `on delete cascade`) o cuando el `jti` es inventado.
    if (!s) return { viva: false, motivo: 'desconocida' };

    const ahora = Date.now();
    const veredicto = juzgarSesion(s, ahora);

    if (!veredicto.viva) {
      // Las que mueren de vejez o de inactividad se marcan cerradas aquí
      // mismo, en vez de dejarlas dormidas: así aparecen como cerradas —con su
      // motivo— en la lista de dispositivos, en lugar de figurar abiertas para
      // siempre porque nadie volvió a mirarlas.
      if (!s.revokedAt) await this.marcarRevocada(jti, veredicto.motivo);
      return veredicto;
    }

    if (tocar) {
      if (
        ahora - s.lastSeenAt.getTime() >
        SessionsService.LATIDO_SEGUNDOS * 1000
      ) {
        await db
          .update(sessions)
          .set({ lastSeenAt: new Date() })
          .where(eq(sessions.id, jti));
      }
      this.comprobadas.set(jti, ahora + SessionsService.CACHE_MS);
      this.podarCache();
    }

    return veredicto;
  }

  // ── Cerrar ───────────────────────────────────────────────────────────────

  /** Cierra UNA sesión. Idempotente: cerrar la ya cerrada no es un error. */
  async revocar(jti: string, motivo: MotivoCierre): Promise<void> {
    await this.marcarRevocada(jti, motivo);
  }

  /**
   * Cierra TODAS las sesiones de una persona.
   *
   * `excepto` es la sesión desde la que se pidió: quien cambia su contraseña
   * desde el celular no quiere que le echen del celular a mitad de la frase.
   * Si se omite, no se salva ninguna — que es lo que hace falta cuando alguien
   * recupera la cuenta porque cree que se la robaron.
   *
   * Devuelve cuántas se cerraron, para poder decirlo.
   */
  async revocarTodas(
    userId: string,
    motivo: MotivoCierre,
    excepto?: string | null,
  ): Promise<number> {
    const filas = await db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: motivo })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          excepto ? sql`${sessions.id} <> ${excepto}` : undefined,
        ),
      )
      .returning({ id: sessions.id });
    for (const f of filas) this.comprobadas.delete(f.id);
    return filas.length;
  }

  // ── Enseñar ──────────────────────────────────────────────────────────────

  /**
   * Las sesiones abiertas de una persona, la más reciente primero.
   *
   * Esto es lo que se pinta en «dispositivos conectados», y es la cura de
   * verdad para el susto del computador prestado: la persona se acuerda desde
   * su celular, lo ve en la lista y lo cierra sin levantarse.
   */
  async listar(userId: string): Promise<SesionAbierta[]> {
    const filas = await db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ip: sessions.ip,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .orderBy(sql`${sessions.lastSeenAt} desc`);

    const corte = Date.now() - SessionsService.INACTIVIDAD_MINUTOS * 60 * 1000;
    return (
      filas
        // Las que ya murieron de inactividad o de vejez pero todavía no ha
        // pasado nadie a comprobarlas no se enseñan: una sesión muerta en la
        // lista de «conectados» es una alarma falsa, y las alarmas falsas son
        // lo que enseña a la gente a ignorar la lista.
        .filter(
          (f) =>
            f.lastSeenAt.getTime() > corte &&
            f.expiresAt.getTime() > Date.now(),
        )
        .map((f) => ({
          id: f.id,
          dispositivo: describirDispositivo(f.userAgent),
          ip: f.ip,
          createdAt: f.createdAt,
          lastSeenAt: f.lastSeenAt,
        }))
    );
  }

  /** ¿Es de esta persona? Para no dejar que nadie cierre la sesión de otro. */
  async pertenece(jti: string, userId: string): Promise<boolean> {
    const [s] = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.id, jti))
      .limit(1);
    return !!s && s.userId === userId;
  }

  // ── Limpieza ─────────────────────────────────────────────────────────────

  /**
   * Borra las sesiones que llevan más de un mes muertas.
   *
   * No se borran en cuanto mueren: una sesión cerrada hace dos días es la
   * respuesta a «¿alguien entró a mi cuenta?», y borrarla al instante es
   * tirar la única prueba. Un mes es tiempo de sobra para preguntarlo y poco
   * para que la tabla crezca sin motivo.
   */
  async limpiar(): Promise<number> {
    const corte = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const filas = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, corte))
      .returning({ id: sessions.id });
    return filas.length;
  }

  // ── Interno ──────────────────────────────────────────────────────────────

  private async marcarRevocada(jti: string, motivo: MotivoCierre) {
    this.comprobadas.delete(jti);
    await db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: motivo })
      .where(and(eq(sessions.id, jti), isNull(sessions.revokedAt)));
  }

  /** La caché no puede crecer sin final en un proceso que vive semanas. */
  private podarCache() {
    if (this.comprobadas.size < 5000) return;
    const ahora = Date.now();
    for (const [jti, hasta] of this.comprobadas) {
      if (hasta <= ahora) this.comprobadas.delete(jti);
    }
  }
}

/** Lo que hay que saber de una sesión para decidir si sigue viva. */
export interface SesionJuzgable {
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

export type Veredicto = { viva: true } | { viva: false; motivo: MotivoCierre };

/**
 * Los tres relojes, en una función que no toca la base.
 *
 * Vive aparte del servicio a propósito: **esta es la regla que decide quién
 * entra**, y una regla así tiene que poder probarse con un reloj de mentira y
 * sin levantar Postgres. El servicio se ocupa de leer la fila y de escribir el
 * resultado; qué significa esa fila se decide aquí.
 *
 * El orden de las comprobaciones importa, y es de lo explícito a lo
 * automático: si alguien cerró la sesión a propósito, ese es el motivo que hay
 * que contarle a la persona —no «caducó»—, aunque además hayan pasado las doce
 * horas.
 */
export function juzgarSesion(s: SesionJuzgable, ahora: number): Veredicto {
  if (s.revokedAt) {
    return {
      viva: false,
      motivo: (s.revokedReason as MotivoCierre) ?? 'salir',
    };
  }
  if (s.expiresAt.getTime() <= ahora) {
    return { viva: false, motivo: 'caducada' };
  }
  if (
    ahora - s.lastSeenAt.getTime() >
    SessionsService.INACTIVIDAD_MINUTOS * 60 * 1000
  ) {
    return { viva: false, motivo: 'inactividad' };
  }
  return { viva: true };
}

/** Por qué se cerró una sesión. Se guarda para poder explicarlo. */
export type MotivoCierre =
  | 'salir'
  | 'salir-todas'
  | 'cambio-contrasena'
  | 'recuperacion'
  | 'inactividad'
  | 'caducada'
  | 'admin'
  | 'desconocida';

/** Una sesión abierta, tal y como se le enseña a su dueño. */
export interface SesionAbierta {
  id: string;
  /** «Chrome en Windows», «Safari en iPhone»… Ver `describirDispositivo`. */
  dispositivo: string;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}

/**
 * Lo que se le dice a la persona sobre el dispositivo.
 *
 * Un `User-Agent` crudo no le dice nada a nadie: es una cadena de doscientos
 * caracteres que menciona cuatro navegadores que no son el que se está usando.
 * Esta función no pretende ser exacta —eso es imposible con el `User-Agent`—,
 * pretende que alguien reconozca cuál de las filas es el computador de la sala
 * en la que estuvo ayer.
 */
export function describirDispositivo(ua: string | null | undefined): string {
  if (!ua) return 'Dispositivo desconocido';
  const sistema = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua)
      ? 'iPad'
      : /Android/i.test(ua)
        ? 'Android'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Macintosh|Mac OS X/i.test(ua)
            ? 'Mac'
            : /Linux/i.test(ua)
              ? 'Linux'
              : null;
  // El orden importa: Edge y Opera se presentan también como Chrome, y Chrome
  // se presenta también como Safari. Mirando primero los específicos, cada uno
  // acaba con su nombre; al revés, todo el mundo es Safari.
  const navegador = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Chrome\//i.test(ua)
          ? 'Chrome'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : null;
  if (navegador && sistema) return `${navegador} en ${sistema}`;
  return navegador ?? sistema ?? 'Dispositivo desconocido';
}
