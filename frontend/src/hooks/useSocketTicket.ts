"use client";

import { useEffect, useState } from "react";
import { obtenerSocketTicketAPI } from "@/lib/api";
import { haySesionProbable, obtenerToken } from "@/lib/sesion";

/**
 * Credencial para abrir el Socket.IO del tatami.
 *
 * El socket manda su token en el payload `auth`, así que necesita un valor
 * legible desde JavaScript — y la sesión ahora vive en una cookie httpOnly que
 * no lo es. Se pide entonces un "ticket" al backend (token de 12 h, ver
 * `/api/auth/socket-ticket`), que se queda en memoria.
 *
 * Devuelve `null` mientras no haya credencial, que es también el caso normal de
 * la pantalla pública: ahí no hay sesión y el socket conecta sin identidad,
 * exactamente igual que antes.
 */
export function useSocketTicket(): string | null {
  const [ticket, setTicket] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    // Recién iniciada la sesión el token ya está en memoria: no hace falta
    // pedir nada. Al recargar se ha perdido, y ahí sí se pide.
    const enMemoria = obtenerToken();
    if (enMemoria) {
      setTicket(enMemoria);
      return;
    }
    if (!haySesionProbable()) return;

    obtenerSocketTicketAPI()
      .then((t) => {
        if (!cancelado) setTicket(t);
      })
      .catch(() => {
        // Sin ticket el tatami sigue funcionando: el socket conecta sin
        // identidad y se pierde a quién atribuir las puntuaciones, que es
        // preferible a dejar la pantalla sin conectar.
      });

    return () => {
      cancelado = true;
    };
  }, []);

  return ticket;
}
