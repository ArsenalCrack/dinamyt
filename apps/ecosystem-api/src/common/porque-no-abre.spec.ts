/**
 * La frase que explica por qué un club no abre una app.
 *
 * Se prueba sola porque es lo ÚNICO que lee un humano cuando algo va mal: si
 * elige mal la suscripción que nombra, manda a alguien a arreglar la fila
 * equivocada — que es peor que no decir nada, porque además se le cree.
 */

import { porQueNoAbre, type SuscripcionMirada } from './porque-no-abre';

const CLUB = 'club-1';
const FEDERACION = 'fed-1';

function sub(p: Partial<SuscripcionMirada> = {}): SuscripcionMirada {
  return {
    orgId: CLUB,
    status: 'ACTIVE',
    endsAt: '2026-01-31',
    planName: 'Membresías',
    appsIncluded: ['membresias'],
    ...p,
  };
}

describe('Por qué no abre', () => {
  // `null` es «no la usa», y por eso no sale en la lista de problemas: meter
  // ahí a todo el que solo compró Campeonatos esconde a los dos que fallan.
  it('sin ninguna suscripción no hay avería que contar', () => {
    expect(porQueNoAbre(CLUB, [CLUB, FEDERACION], [])).toBeNull();
  });

  it('un plan de otra app no cuenta como plan de ésta', () => {
    const otra = sub({ planName: 'Campeonatos', appsIncluded: ['campeonatos'] });
    expect(porQueNoAbre(CLUB, [CLUB], [otra])).toBeNull();
  });

  // El caso que motivó todo esto: la suscripción existe, la fecha es buena, el
  // plan es el correcto… y el club no abre nada porque nadie la activó.
  it('la que nadie activó dice QUÉ hacer, no solo qué pasa', () => {
    const frase = porQueNoAbre(CLUB, [CLUB], [sub({ status: 'PENDING_REVIEW' })]);
    expect(frase).toContain('EN REVISIÓN');
    expect(frase).toContain('Activa');
  });

  it('«Activa» con la fecha pasada es una vencida, y se nombra el día', () => {
    const frase = porQueNoAbre(CLUB, [CLUB], [sub({ endsAt: '2026-01-31' })]);
    expect(frase).toContain('venció el 2026-01-31');
  });

  it('sin plan pero con la app contratada por la federación, sí hay frase', () => {
    const frase = porQueNoAbre(
      CLUB,
      [CLUB, FEDERACION],
      [sub({ orgId: FEDERACION, status: 'PENDING_REVIEW' })],
    );
    expect(frase).not.toBeNull();
  });

  it('una fecha con hora se cuenta por el día escrito, no por el reloj', () => {
    const frase = porQueNoAbre(
      CLUB,
      [CLUB],
      [sub({ endsAt: new Date('2026-01-31T23:00:00.000Z') })],
    );
    expect(frase).toContain('2026-01-31');
  });

  // Con dos candidatas se nombra la que está más cerca de abrir: es la única
  // que alguien puede tocar hoy para arreglarlo.
  it('entre una vencida vieja y una sin activar, manda la sin activar', () => {
    const frase = porQueNoAbre(CLUB, [CLUB], [
      sub({ endsAt: '2025-03-01' }),
      sub({ status: 'PENDING_REVIEW', endsAt: '2026-12-31' }),
    ]);
    expect(frase).toContain('EN REVISIÓN');
  });

  it('con el mismo estado, la de vencimiento más lejano', () => {
    const frase = porQueNoAbre(CLUB, [CLUB], [
      sub({ endsAt: '2025-03-01' }),
      sub({ endsAt: '2026-02-28' }),
    ]);
    expect(frase).toContain('2026-02-28');
  });

  // La herencia baja: si lo que falla es el plan de la federación, decir «tu
  // suscripción» manda al maestro a buscar una fila que no es suya.
  it('un plan heredado se nombra como de la federación', () => {
    const frase = porQueNoAbre(
      CLUB,
      [CLUB, FEDERACION],
      [sub({ orgId: FEDERACION, status: 'SUSPENDED' })],
    );
    expect(frase).toContain('de su federación');
    expect(frase).toContain('suspendida');
  });

  it('el plan de OTRA organización que no está en su cadena no se mira', () => {
    const ajena = sub({ orgId: 'club-2', status: 'PENDING_REVIEW' });
    expect(porQueNoAbre(CLUB, [CLUB], [ajena])).toBeNull();
  });
});
