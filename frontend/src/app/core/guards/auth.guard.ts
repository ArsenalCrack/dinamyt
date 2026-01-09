import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
  const username = sessionStorage.getItem('username') || sessionStorage.getItem('userName');
  const correo = sessionStorage.getItem('correo');

  // Permitir acceso si hay token, username o correo (identificador de sesión)
  if (token || username || correo) {
    return true;
  }

  // Asegurar que el AuthService también sabe que no hay sesión
  authService.setLoggedIn(false, null);
  router.navigate(['/login']);
  return false;
};

