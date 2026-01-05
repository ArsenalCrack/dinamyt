import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent } from './features/login/login.component';
import { RegistroComponent } from './features/registro/registro.component';
import { VerifyComponent } from './features/verify/verify.component';
import { verificationGuard } from './core/guards/verification.guard';
import { ConfirmEmailComponent } from './features/confirm-email/confirm-email.component';
import { ResetPasswordComponent } from './features/reset-password/reset-password.component';

export const routes: Routes = [
  // 1. Rutas específicas primero
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'recoverAccount', component: ConfirmEmailComponent },
  { path: 'register', component: RegistroComponent },


  {
    path: 'verify',
    component: VerifyComponent,
    canActivate: [verificationGuard]
  },

  {
    path: 'resetPassword',
    component: ResetPasswordComponent,
    canActivate: [verificationGuard]
  },

  // El comodín SIEMPRE va al final (es el "si nada de lo anterior funcionó")
  { path: '**', redirectTo: '' }
];
