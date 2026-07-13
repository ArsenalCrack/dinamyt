# DINAMYT Membresías — Agente del lector

Proceso **local** que corre en el PC/tablet Windows del kiosco. Es el **único**
componente que habla con el hardware del lector de huella (vía su SDK) y expone un
**contrato estable** por `localhost` a la PWA de Membresías. Por eso **la marca del
lector solo afecta a este agente**: la API, la BD y la web no cambian al cambiar de
lector.

## Contrato (localhost:7070)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/status` | `{ readerConnected, vendor }` — la PWA lo pinguea; si no responde, opera en modo sin lector (QR/PIN/manual). |
| POST | `/enroll` | Captura una huella y devuelve `{ template, format }`. La PWA la sube a `membresias-api` (`POST /memberships/:id/biometrics`). |
| POST | `/identify` | `{ candidatos: [{ value, template }] }` → `{ match, value }` (1:N local). `value` = `ecosystem_user_id` para el check-in. |

## Adaptadores por marca (lock-in)

`src/adapters/reader.ts` define la interfaz `ReaderAdapter`. Hoy incluye `MockReader`
(dev/CI, sin hardware). Para producción se implementa un adaptador por marca
(**DigitalPersona U.are.U 4500** o **ZKTeco ZK4500/SLK20R**) usando su SDK de Windows.
La **plantilla** es un formato propietario por marca: se elige una y se guarda su
`format`; cambiar de marca obliga a re-enrolar a todos.

## Uso

```bash
pnpm --filter @dinamyt/membresias-agent dev     # arranca en 127.0.0.1:7070 (mock)
READER_VENDOR=digitalpersona pnpm ... start      # con adaptador real (a implementar)
```
