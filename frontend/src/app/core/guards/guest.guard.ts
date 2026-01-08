import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

// Permite acceso solo a usuarios NO autenticados.
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);

  const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
  const username = sessionStorage.getItem('username') || sessionStorage.getItem('userName');
  const correo = sessionStorage.getItem('correo');

  if (token || username || correo) {
    // Ya autenticado: redirigir al dashboard
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};
