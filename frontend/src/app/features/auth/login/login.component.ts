import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {

  private location = inject(Location);
  private router = inject(Router);
  private api = inject(ApiService);

  mostrarPass: boolean = false;
  cargando: boolean = false;
  errorMessage: string | null = null;

  correo: string = '';
  contrasena: string = '';

  volverAtras() {
    this.location.back();
  }

  login() {
    this.errorMessage = null;
    this.cargando = true;

    this.api.login({ correo: this.correo, contrasena: this.contrasena }).subscribe({
      next: (res: any) => {
        this.cargando = false;
        // Backend expected to return token and user info
        const token = res?.token || res?.accessToken || null;
        const user = res?.user || res?.usuario || res;
        if (token) {
          sessionStorage.setItem('token', token);
        }
        if (user) {
          const name = user?.username || user?.name || user?.nombre || null;
          if (name) sessionStorage.setItem('username', name);
        }
        // if login successful, navigate to dashboard
        this.router.navigate(['/dashboard']);

      },
      error: (err: HttpErrorResponse) => {
        this.cargando = false;
        this.errorMessage = err.error?.message || err.statusText || 'Error al iniciar sesión';
      }
    });
  }

  closeError() {
    this.errorMessage = null;
  }



}
