import { Component, inject, OnDestroy } from '@angular/core';
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
export class LoginComponent implements OnDestroy {

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

  private lockScroll() { document.body.style.overflow = 'hidden'; }
  private unlockScroll() { document.body.style.overflow = ''; }

  login() {
    this.errorMessage = null;
    this.cargando = true;
    this.lockScroll();

    this.api.login({ correo: this.correo, contrasena: this.contrasena }).subscribe({
      next: (res: any) => {
        localStorage.setItem('usuario', JSON.stringify(res.usuario));
        console.log('Respuesta del backend:', res);

        // Backend expected to return token and user info
        const token = res?.token || res?.accessToken || null;
        const user = res?.user || res?.usuario || res;
        const instructorObj = res?.instructor.idDocumento;


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
          const toSessionString = (val: any): string | null => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'string') {
              const s = val.trim();
              return s ? s : null;
            }
            if (typeof val === 'number' || typeof val === 'boolean') return String(val);
            if (typeof val === 'object') {
              const id = (val as any)?.id;
              if (id !== null && id !== undefined) return String(id);
              const nombre = (val as any)?.nombre ?? (val as any)?.name;
              if (nombre !== null && nombre !== undefined) {
                const s = String(nombre).trim();
                return s ? s : null;
              }
            }
            return null;
          };

          // Guardar datos del usuario según las variables del proyecto
          const name = user?.nombreC || user?.username || user?.name || user?.nombre || null;
          if (name) {
            sessionStorage.setItem('nombreC', name);
            console.log('Username guardado:', name);
            this.auth.setLoggedIn(true, name);
          }

          // Guardar otros datos del usuario si están disponibles
          const idDocumento = toSessionString(user?.idDocumento);
          if (idDocumento) sessionStorage.setItem('idDocumento', idDocumento);

          const correo = toSessionString(user?.correo);
          if (correo) sessionStorage.setItem('correo', correo);

          const sexo = toSessionString(user?.sexo);
          if (sexo) sessionStorage.setItem('sexo', sexo);

          const fechaNacimiento = toSessionString(user?.fechaNacimiento);
          if (fechaNacimiento) sessionStorage.setItem('fechaNacimiento', fechaNacimiento);

          const cinturonRango = toSessionString(user?.cinturonRango);
          if (cinturonRango) sessionStorage.setItem('cinturonRango', cinturonRango);

          const nacionalidad = toSessionString(user?.nacionalidad);
          if (nacionalidad) sessionStorage.setItem('nacionalidad', nacionalidad);

          const numeroCelular = toSessionString(user?.numeroCelular);
          if (numeroCelular) sessionStorage.setItem('numeroCelular', numeroCelular);

          const academia = toSessionString(user?.academia);
          if (academia) sessionStorage.setItem('academia', academia);
          else sessionStorage.removeItem('academia');


          console.log(instructorObj);
          if (instructorObj) {
            sessionStorage.setItem('Instructor', instructorObj);
            sessionStorage.setItem('instructor', instructorObj);
          } else {
            sessionStorage.removeItem('Instructor');
            sessionStorage.removeItem('instructor');
          }
        }

        // Mantener el spinner visible por 2 segundos antes de navegar
        console.log('Esperando 2 segundos antes de navegar...');
        setTimeout(() => {
          this.cargando = false;
          this.unlockScroll();
          console.log('Navegando a dashboard...');
          this.router.navigate(['/dashboard']);
        }, 2000);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error en login:', err);
        this.cargando = false;
        this.unlockScroll();

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

  ngOnDestroy(): void {
    this.unlockScroll();
  }
}
