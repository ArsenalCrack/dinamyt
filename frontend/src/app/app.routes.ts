import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent, RegistroComponent, ConfirmEmailComponent, VerifyComponent, ResetPasswordComponent } from './features/auth/index';
import { verificationGuard } from './core/guards/verification.guard';
import { authGuard } from './core/guards/auth.guard';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  // 1. Rutas específicas primero
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'recoverAccount', component: ConfirmEmailComponent, canActivate: [guestGuard] },
  { path: 'register', component: RegistroComponent, canActivate: [guestGuard] },

  {
    path: '404',
    loadComponent: () => import('./features/not-found/not-found.component').then(m => m.NotFoundComponent)
  },

  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  {
    path: 'perfil',
    loadComponent: () => import('./features/user/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard]
  },
  {
    path: 'mi-academia',
    loadComponent: () => import('./features/user/my-academy/my-academy.component').then(m => m.MyAcademyComponent),
    canActivate: [authGuard]
  },
  {
    path: 'account/password',
    loadComponent: () => import('./features/user/change-password/change-password.component').then(m => m.ChangePasswordComponent),
    canActivate: [authGuard]
  },
  {
    path: 'mis-campeonatos',
    loadComponent: () => import('./features/user/my-championships/my-championships.component').then(m => m.MyChampionshipsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'mis-estadisticas',
    loadComponent: () => import('./features/user/my-statistics/my-statistics.component').then(m => m.MyStatisticsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'campeonatos',
    loadComponent: () => import('./features/user/explore-championships/explore-championships.component').then(m => m.ExploreChampionshipsComponent)
  },
  {
    path: 'campeonatos/crear',
    loadComponent: () => import('./features/championship/create-championship/create-championship.component').then(m => m.CreateChampionshipComponent),
    canActivate: [authGuard]
  },
  {
    path: 'campeonato/details/:id',
    loadComponent: () => import('./features/championship/championship-details/championship-details.component').then(m => m.ChampionshipDetailsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'campeonato/edit/:id',
    loadComponent: () => import('./features/championship/edit-championship/edit-championship.component').then(m => m.EditChampionshipComponent),
    canActivate: [authGuard]
  },
  {
    path: 'campeonato/register/:id',
    loadComponent: () => import('./features/championship/championship-registration/championship-registration.component').then(m => m.ChampionshipRegistrationComponent),
    canActivate: [authGuard]
  },


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
  { path: '**', redirectTo: '404' }
];
