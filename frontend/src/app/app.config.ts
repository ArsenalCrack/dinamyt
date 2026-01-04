import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';

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
    provideHttpClient()
  ]
};
