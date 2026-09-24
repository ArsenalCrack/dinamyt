import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Next 16 quitó `next lint`: el script lo tomaba por una carpeta llamada «lint»
// y fallaba sin revisar nada. Esta es la configuración plana que trae
// `create-next-app` 16.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Las dos reglas nuevas del compilador de React quedan como AVISO, no como
    // error. Las 26 veces que saltaban el 24 sep 2026 eran patrones buscados:
    // cargar datos al montar (`useEffect(() => { cargar() }, [])`) y el «ref
    // con la última función» de `EscanerQR` y `useFiltros`, que está ahí
    // precisamente para no reiniciar la cámara ni pisar los filtros. Siguen
    // saliendo en `pnpm lint`, para ir quitándolas cuando se toque cada archivo.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'public/sw.js']),
]);
