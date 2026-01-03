import { Routes } from '@angular/router';
// Asegúrate de que la ruta del import sea correcta según tus carpetas
import { HomeComponent } from './features/home/home.component';

export const routes: Routes = [
  // Cuando la ruta está vacía (localhost:4200), muestra el Home
  { path: '', component: HomeComponent },

  // (Opcional) Si escriben una ruta loca, redirigir al Home
  { path: '**', redirectTo: '' }
];
