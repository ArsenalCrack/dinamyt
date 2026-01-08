import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { AuthService } from './app/core/services/auth.service';
import { inject } from '@angular/core';

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    // Exponer AuthService globalmente para permisos temporales en desarrollo
    const authService = appRef.injector.get(AuthService);
    (window as any).grantDevPermissions = (role: string = 'admin') => {
      authService.grantTemporaryPermissions(role);
      console.log(`✅ Permisos "${role}" otorgados temporalmente. Recarga la página.`);
    };
    (window as any).revokeDevPermissions = () => {
      authService.revokeTemporaryPermissions();
      console.log(`❌ Permisos revocados. Recarga la página.`);
    };
    console.log('💡 Comandos disponibles:');
    console.log('  grantDevPermissions("admin") - Otorga permisos de admin');
    console.log('  grantDevPermissions("creator") - Otorga permisos de creador');
    console.log('  revokeDevPermissions() - Revoca permisos temporales');
  })
  .catch((err) => console.error(err));
