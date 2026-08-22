'use client';

import { fuerzaContrasena, requisitosContrasena } from '@/lib/validacion';

/**
 * Los mínimos de la contraseña, a la vista mientras se teclea.
 *
 * ── Por qué no basta con «mín. 8 caracteres» ──
 *
 * Eso era lo único que decía el registro, y es lo único que exigía el servidor:
 * `12345678` entraba. Ocho caracteres no es una medida de seguridad, es una
 * medida de longitud.
 *
 * Los requisitos se enseñan TODOS desde el principio, en gris, y se van
 * marcando. Es distinto de enseñar el error cuando ya falló: aquí la persona ve
 * lo que le falta ANTES de intentar nada, y la lista deja de ser un reproche
 * para ser una instrucción. Los cuatro que hay son los que la API exige — ni
 * uno más, para no pedir símbolos raros que acaban en un papelito.
 *
 * La barra de encima mide lo que los requisitos no: el largo de verdad. Con los
 * cuatro cumplidos la contraseña es «suficiente»; lo que sube de ahí es pasar
 * de doce caracteres y usar algún símbolo, que es lo único que de verdad cuenta
 * cuando alguien intenta adivinarla a máquina.
 */
export function MedidorContrasena({ clave }: { clave: string }) {
  const requisitos = requisitosContrasena(clave);
  const { nivel, etiqueta } = fuerzaContrasena(clave);

  return (
    <div className="medidor">
      <div
        className="medidor-barra"
        role="img"
        aria-label={etiqueta ? `Fuerza de la contraseña: ${etiqueta}` : 'Sin contraseña'}
      >
        {[1, 2, 3, 4].map((t) => (
          <span
            key={t}
            className="medidor-tramo"
            data-lleno={t <= nivel}
            data-nivel={nivel}
          />
        ))}
      </div>
      <ul className="medidor-requisitos">
        {requisitos.map((r) => (
          <li key={r.clave} data-cumple={r.cumple}>
            <span aria-hidden="true">{r.cumple ? '✓' : '○'}</span>
            {r.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
