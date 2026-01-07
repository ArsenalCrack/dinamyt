import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent, RegistroComponent, ConfirmEmailComponent, VerifyComponent, ResetPasswordComponent } from './features/auth/index';
import { verificationGuard } from './core/guards/verification.guard';
import { authGuard } from './core/guards/auth.guard';
import { DashboardComponent } from './features/dashboard/dashboard.component';

export const routes: Routes = [
  // 1. Rutas específicas primero
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'recoverAccount', component: ConfirmEmailComponent },
  { path: 'register', component: RegistroComponent },

  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },


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
