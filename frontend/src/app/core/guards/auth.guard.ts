import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);

  const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
  const username = sessionStorage.getItem('username') || sessionStorage.getItem('userName');

  if (token || username) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
