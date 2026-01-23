import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import localeEs from '@angular/common/locales/es';
import { registerLocaleData } from '@angular/common';

registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    // La configuración del scroll debe ser el segundo argumento de provideRouter
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled', // Restaura el scroll al inicio al navegar
        anchorScrolling: 'enabled'            // Opcional: permite navegar a anclas #id
      })
    ),
    provideHttpClient(),
    { provide: LOCALE_ID, useValue: 'es' }
  ]
};
