import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { db } from '../../db';
import { organizations, users } from '../../db/schema';
import { directorioMedia, esRutaMedia } from '../../common/almacen-imagenes';
import { pedirSupresionAMembresias } from '../../common/espejo-membresias';
import { pedirSupresionACampeonatos } from '../../common/espejo-campeonatos';
import { pedirSupresionAAcademy } from '../../common/espejo-academy';
import { MailerService } from '../auth/mailer.service';
import { SessionsService } from '../auth/sessions.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { borrarDeLaBase } from './borrar-de-la-base';

/** Días entre pedir el borrado y que se haga. Decidido el 14 oct 2026. */
export const DIAS_DE_GRACIA = 7;
/** Lo que hay que escribir para confirmar. La pantalla lo pide igual. */
export const PALABRA_DE_CONFIRMACION = 'BORRAR';

type Pendiente = { id: string; motivo: string };

/**
 * «Borrar mi cuenta», con siete días para arrepentirse.
 *
 * ── Pedirlo ──
 *
 * Con la contraseña y la palabra escrita. Se cierran TODAS sus sesiones en el
 * acto —si quien lo pidió no era el dueño, que no siga dentro—, se le escribe
 * al correo de la cuenta, y la cuenta queda entera con `borrar_el` puesto.
 * Entrar otra vez es lo único que hace falta para cancelarlo.
 *
 * No lo puede pedir la única persona que administra un club (dejaría el club
 * sin quien lo gestione, OPERAR §4.7-bis) ni un super administrador (se dan a
 * mano y se quitan a mano).
 *
 * ── Hacerlo ──
 *
 * El barrido diario (`POST /subscriptions/avisos/cron`) borra las vencidas.
 * Primero en Membresías, Campeonatos y Academy, después aquí: con la fila
 * todavía entera, el `eco_sub` y el documento siguen sirviendo para
 * encontrarla allí, y si una no contesta, la cuenta espera al día siguiente
 * sin haber perdido nada. Qué se borra y qué se queda: `borrar-de-la-base.ts`.
 */
@Injectable()
export class SupresionService {
  private readonly log = new Logger('Supresion');

  constructor(
    private readonly usersService: UsersService,
    private readonly sessions: SessionsService,
    private readonly orgs: OrganizationsService,
    private readonly mailer: MailerService,
  ) {}

  async estado(userId: string): Promise<{ borrarEl: Date | null }> {
    const [u] = await db
      .select({ borrarEl: users.borrarEl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return { borrarEl: u?.borrarEl ?? null };
  }

  async pedir(
    userId: string,
    datos: { contrasena?: string; confirmacion?: string },
  ): Promise<{ borrarEl: Date }> {
    if ((datos.confirmacion ?? '').trim().toUpperCase() !== PALABRA_DE_CONFIRMACION) {
      throw new BadRequestException(`Escribe ${PALABRA_DE_CONFIRMACION} para confirmar.`);
    }
    const [u] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        passwordHash: users.passwordHash,
        isSuperAdmin: users.isSuperAdmin,
        timezone: users.timezone,
        borradaEl: users.borradaEl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u || u.borradaEl) throw new NotFoundException('No encontrado.');
    if (u.isSuperAdmin) {
      throw new ConflictException(
        'Una cuenta de super administrador no se borra desde aquí. Pide primero que te quiten ese permiso.',
      );
    }
    // 400 y no 401: el portal trata un 401 como sesión caducada y te sacaría.
    if (!(await this.usersService.verifyPassword(datos.contrasena ?? '', u.passwordHash))) {
      throw new BadRequestException('La contraseña no es correcta.');
    }
    await this.exigirQueNoDejeClubesSinMando(userId);

    const borrarEl = new Date(Date.now() + DIAS_DE_GRACIA * 24 * 60 * 60 * 1000);
    await db
      .update(users)
      .set({ borrarEl, updatedAt: new Date() })
      .where(eq(users.id, userId));
    const cerradas = await this.sessions.revocarTodas(userId, 'borrado');
    // El correo no detiene nada si falla: lo que protege es el plazo, y el
    // aviso es para que el dueño de verdad se entere si no fue él.
    void this.mailer
      .avisarBorradoProgramado({
        to: u.email,
        nombre: u.fullName,
        borrarEl,
        zona: u.timezone,
      })
      .catch(() => false);
    this.log.warn(
      `Borrado pedido: ${userId} (${cerradas} sesiones cerradas), se hará el ${borrarEl.toISOString()}.`,
    );
    return { borrarEl };
  }

  async cancelar(userId: string): Promise<{ borrarEl: null }> {
    const filas = await db
      .update(users)
      .set({ borrarEl: null, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.borradaEl)))
      .returning({ id: users.id });
    if (filas.length === 0) throw new NotFoundException('No encontrado.');
    this.log.warn(`Borrado cancelado: ${userId}.`);
    return { borrarEl: null };
  }

  /** Lo que llama el barrido diario. Nunca lanza: informa. */
  async ejecutarVencidas(): Promise<{ suprimidas: number; pendientes: Pendiente[] }> {
    const vencidas = await db
      .select({
        id: users.id,
        email: users.email,
        documentId: users.documentId,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(and(lte(users.borrarEl, new Date()), isNull(users.borradaEl)));

    let suprimidas = 0;
    const pendientes: Pendiente[] = [];
    for (const persona of vencidas) {
      try {
        const motivo = await this.suprimir(persona);
        if (motivo) pendientes.push({ id: persona.id, motivo });
        else suprimidas += 1;
      } catch (e) {
        pendientes.push({ id: persona.id, motivo: e instanceof Error ? e.message : 'falló' });
      }
    }
    for (const p of pendientes) {
      this.log.error(`Borrado de ${p.id} aplazado: ${p.motivo}. Se reintenta mañana.`);
    }
    return { suprimidas, pendientes };
  }

  /** Devuelve el motivo si no se pudo, o `null` si quedó hecho. */
  private async suprimir(persona: {
    id: string;
    email: string;
    documentId: string | null;
    avatarUrl: string | null;
  }): Promise<string | null> {
    const sinMando = await this.orgs.dondeEsElUnicoGestor(persona.id);
    if (sinMando.length > 0) {
      return `es la única persona que administra ${sinMando.join(', ')}`;
    }

    // En producción, un canal sin configurar también espera: la política dice
    // que se borra en las tres apps, y borrar solo aquí lo desmentiría.
    // Fuera de producción no hay Membresías ni Campeonatos al otro lado.
    const enProduccion = process.env.NODE_ENV === 'production';
    const membresias = await pedirSupresionAMembresias(persona.id);
    if (membresias === 'fallo') return 'Membresías no confirmó';
    if (membresias === 'sin-espejo' && enProduccion) {
      return 'falta MEMBRESIAS_SYNC_URL o su secreto';
    }
    const campeonatos = await pedirSupresionACampeonatos({
      ecoSub: persona.id,
      documento: persona.documentId,
    });
    if (campeonatos === 'fallo') return 'Campeonatos no confirmó';
    if (campeonatos === 'sin-espejo' && enProduccion) {
      return 'falta CAMPEONATOS_SYNC_URL o su secreto (OPERAR §4.15)';
    }
    // Academy sin canal no espera, ni en producción: no está encendida
    // (HOJA-DE-RUTA, «Encender Academy»), así que allí no hay nada de nadie.
    // `ACADEMY_SYNC_URL` se pone el mismo día que se enciende (MONTAR-VPS,
    // Anexo B); un error suyo sí espera, como los de las otras dos.
    const academy = await pedirSupresionAAcademy(persona.id);
    if (academy === 'fallo') return 'Academy no confirmó';

    await db.transaction((tx) => borrarDeLaBase(tx, persona));
    await this.borrarFotoSiNadieLaUsa(persona.avatarUrl);
    this.log.warn(`Cuenta borrada: ${persona.id}.`);
    return null;
  }

  private async exigirQueNoDejeClubesSinMando(userId: string) {
    const sinMando = await this.orgs.dondeEsElUnicoGestor(userId);
    if (sinMando.length === 0) return;
    const donde = sinMando.map((n) => `«${n}»`).join(', ');
    throw new ConflictException(
      `Eres la única persona que administra ${donde}: sin ti nadie podría gestionarlo. ` +
        'Nombra antes a otro maestro o administrador; si lo que quieres es cerrarlo, desactívalo primero.',
    );
  }

  /**
   * La foto vive en el disco con el hash de su contenido por nombre (§4.20):
   * dos personas con la misma imagen comparten archivo. Solo se borra si ya no
   * la usa nadie más, ni otra persona ni el escudo de un club.
   */
  private async borrarFotoSiNadieLaUsa(url: string | null) {
    if (!url || !esRutaMedia(url)) return;
    const nombre = basename(url);
    if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(nombre)) return;
    const [otra] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.avatarUrl, url))
      .limit(1);
    const [escudo] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(or(eq(organizations.logoUrl, url)))
      .limit(1);
    if (otra || escudo) return;
    try {
      await unlink(join(directorioMedia(), nombre));
    } catch {
      // Ya no estaba, o el almacén está apagado: no hay nada que borrar.
    }
  }
}
