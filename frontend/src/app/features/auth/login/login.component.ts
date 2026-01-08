import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
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
  private auth = inject(AuthService);

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
        console.log('Respuesta del backend:', res);

        // Backend expected to return token and user info
        const token = res?.token || res?.accessToken || null;
        const user = res?.user || res?.usuario || res;

        console.log('Token extraído:', token);
        console.log('Usuario extraído:', user);

        if (token) {
          sessionStorage.setItem('token', token);
          console.log('Token guardado en sessionStorage');
        }

        // Guardar correo como identificador de sesión
        sessionStorage.setItem('correo', this.correo);
        console.log('Correo guardado:', this.correo);

        if (user && typeof user === 'object') {
          // Guardar datos del usuario según las variables del proyecto
          const name = user?.nombreC || user?.username || user?.name || user?.nombre || null;
          if (name) {
            sessionStorage.setItem('username', name);
            console.log('Username guardado:', name);
            this.auth.setLoggedIn(true, name);
          }

          // Guardar otros datos del usuario si están disponibles
          if (user?.idDocumento) sessionStorage.setItem('idDocumento', user.idDocumento);
          if (user?.sexo) sessionStorage.setItem('sexo', user.sexo);
          if (user?.fechaNacimiento) sessionStorage.setItem('fechaNacimiento', user.fechaNacimiento);
          if (user?.cinturonRango) sessionStorage.setItem('cinturonRango', user.cinturonRango);
          if (user?.nacionalidad) sessionStorage.setItem('nacionalidad', user.nacionalidad);
          if (user?.numeroCelular) sessionStorage.setItem('numeroCelular', user.numeroCelular);
          if (user?.academia) sessionStorage.setItem('academia', user.academia);
          if (user?.instructor) sessionStorage.setItem('instructor', user.instructor);
        }

        // Mantener el spinner visible por 2 segundos antes de navegar
        console.log('Esperando 2 segundos antes de navegar...');
        setTimeout(() => {
          this.cargando = false;
          console.log('Navegando a dashboard...');
          this.router.navigate(['/dashboard']);
        }, 2000);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error en login:', err);
        this.cargando = false;

        // Mensajes de error más específicos según el código de estado
        if (err.status === 401) {
          // 401 = No autorizado (credenciales incorrectas)
          const mensaje = err.error?.message || err.error?.error || '';
          if (mensaje.toLowerCase().includes('contraseña') || mensaje.toLowerCase().includes('password')) {
            this.errorMessage = 'Contraseña incorrecta. Por favor verifica e intenta nuevamente.';
          } else if (mensaje.toLowerCase().includes('correo') || mensaje.toLowerCase().includes('email')) {
            this.errorMessage = 'El correo ingresado no está registrado.';
          } else {
            this.errorMessage = 'Correo o contraseña incorrectos. Por favor verifica tus credenciales.';
          }
        } else if (err.status === 404) {
          // 404 = Usuario no encontrado
          this.errorMessage = 'El correo ingresado no está registrado en el sistema.';
        } else if (err.status === 403) {
          // 403 = Cuenta bloqueada o no verificada
          this.errorMessage = err.error?.message || 'Tu cuenta no está activa. Verifica tu correo electrónico.';
        } else if (err.status === 0) {
          // Sin conexión al servidor
          this.errorMessage = 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
        } else {
          // Otros errores
          this.errorMessage = err.error?.message || err.error?.error || err.statusText || 'Error al iniciar sesión. Intenta nuevamente.';
        }
      }
    });
  }

  closeError() {
    this.errorMessage = null;
  }



}
