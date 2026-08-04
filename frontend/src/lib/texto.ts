/**
 * Normalización de los textos que son NOMBRES.
 *
 * Los nombres de personas y de clubes los teclean personas distintas en
 * momentos distintos —el admin al crear al maestro, el maestro al inscribir a
 * su alumno, el auxiliar al corregir un dedazo— y en la misma lista salían
 * «Juan pérez», «JUAN PEREZ» y «Juan Pérez». En una planilla de competencia, en
 * el acta de resultados y en la llave impresa eso se nota.
 *
 * Por eso se guardan en MAYÚSCULAS (el backend los normaliza igual, ver
 * `_mayusculas` en `backend/app/api/auth.py` y `competidores.py`) y además se
 * escriben así: aplicarlo solo al guardar dejaría al usuario tecleando «Juan
 * Pérez» y viendo «JUAN PÉREZ» al recargar, sin saber por qué.
 *
 * `toUpperCase()` a secas y no `toLocaleUpperCase`: en español dan lo mismo
 * —las tildes y la eñe se conservan (josé → JOSÉ, ñuñez → ÑUÑEZ)— y la versión
 * con idioma solo cambia el resultado en turco.
 *
 * Es una conversión que PIERDE información: de «JUAN PÉREZ» ya no se vuelve a
 * «Juan Pérez». Es la decisión que se tomó a propósito.
 */
export function enMayusculas(valor: string): string {
  return valor.toUpperCase();
}
