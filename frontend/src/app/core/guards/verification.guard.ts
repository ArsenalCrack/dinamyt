import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const verificationGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);

  const email = sessionStorage.getItem('emailParaVerificar');
  const mode = sessionStorage.getItem('verifyMode');

  // ❌ Sin email o sin modo → fuera
  if (!email || !mode) {
    router.navigate(['/login']);
    return false;
  }

  // 🔹 VERIFY: acepta ambos modos
  if (state.url === '/verify') {
    if (mode === 'register' || mode === 'recovery') {
      return true;
    }
    router.navigate(['/login']);
    return false;
  }

  // 🔹 RESET PASSWORD: solo recovery
  if (state.url === '/resetPassword') {
    if (mode === 'recovery') {
      return true;
    }
    router.navigate(['/login']);
    return false;
  }

  // ❌ Cualquier otra cosa
  router.navigate(['/login']);
  return false;
};
