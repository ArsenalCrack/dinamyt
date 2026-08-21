'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cerrarSesion } from '@/lib/api';
import { destinoSeguro } from '@/lib/apps';

/**
 * Cerrar la sesión del portal desde fuera.
 *
 * ── Por qué existe esta pantalla ──
 *
 * La sesión del portal vive en el `localStorage` de ESTE dominio. Membresías,
 * Campeonatos y Academy están en dominios distintos, y ningún navegador les
 * deja tocarlo: por eso «Salir» en una app federada cerraba su propia sesión y
 * dejaba la del portal intacta. El resultado era desconcertante — salías,
 * pulsabas «entrar con DINAMYT», y el portal te devolvía un token nuevo al
 * instante sin enseñarte una sola pantalla. Parecía que salir no funcionaba,
 * cuando lo que pasaba es que solo se cerraba la mitad.
 *
 * La única forma de cerrarla es que el navegador PASE por aquí. Por eso esta
 * ruta no pide nada, no pregunta nada y no tiene botones: cierra y sigue. La
 * pantalla es un cartel de paso, no un formulario.
 *
 * ── El `redirect` está en lista blanca ──
 *
 * A dónde se sigue después lo valida `destinoSeguro`, el mismo que usa el
 * login. Sin eso, un enlace a `/salir?redirect=<cualquier web>` cerraría la
 * sesión de quien lo pulse y lo dejaría en un sitio ajeno con toda la pinta de
 * seguir dentro de DINAMYT. Si el destino no es una app conocida, se ignora y
 * se acaba en el login de aquí.
 */
export default function SalirPage() {
  return (
    <Suspense fallback={null}>
      <Salir />
    </Suspense>
  );
}

function Salir() {
  const router = useRouter();
  const search = useSearchParams();
  const [destino] = useState(() => destinoSeguro(search.get('redirect')));

  useEffect(() => {
    cerrarSesion();
    // `location.href` y no `router.replace`: el destino habitual está en otro
    // origen, y ahí el router de Next no llega.
    if (destino) {
      window.location.href = destino.url;
      return;
    }
    router.replace('/login');
  }, [destino, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
      <p className="display text-lg">Cerrando tu sesión de DINAMYT…</p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {destino ? `Volviendo a ${destino.nombre}.` : 'Un momento.'}
      </p>
    </main>
  );
}
