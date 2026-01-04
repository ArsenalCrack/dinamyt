import { Routes } from '@angular/router';
// Asegúrate de que la ruta del import sea correcta según tus carpetas
import { HomeComponent } from './features/home/home.component';
import { LoginComponent } from './features/login/login.component';
import { RegistroComponent } from './features/registro/registro.component';

export const routes: Routes = [
  // Cuando la ruta está vacía (localhost:4200), muestra el Home
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'registro', component: RegistroComponent },

  // (Opcional) Si escriben una ruta loca, redirigir al Home
  { path: '**', redirectTo: '' }
];
