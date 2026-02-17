import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { extractUserRoles } from '../../../core/utils/user-type.util';
import { delayRemaining } from '../../../core/utils/spinner-timing.util';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, LoadingSpinnerComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnDestroy {

  private location = inject(Location);
  private router = inject(Router);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private scrollLock = inject(ScrollLockService);
  private backNav = inject(BackNavigationService);

  private scrollLocked = false;

  mostrarPass: boolean = false;
  cargando: boolean = false;
  mensajeError: string | null = null;

  correo: string = '';
  contrasena: string = '';

  volverAtras() {
    this.backNav.backOr({ fallbackUrl: '/' });
  }

  private lockScroll() {
    if (this.scrollLocked) return;
    this.scrollLock.lock();
    this.scrollLocked = true;
  }

  private unlockScroll() {
    if (!this.scrollLocked) return;
    this.scrollLock.unlock();
    this.scrollLocked = false;
  }

  login() {
    this.mensajeError = null;
    this.cargando = true;
    this.lockScroll();
    const startedAt = Date.now();

    this.api.login({ correo: this.correo, contrasena: this.contrasena }).subscribe({
      next: async (res: any) => {
        localStorage.setItem('usuario', JSON.stringify(res));

        // El backend debe retornar token e información del usuario
        const token = res?.token || res?.accessToken || null;
        const user = res?.user || res?.usuario || res;

        if (token) {
          sessionStorage.setItem('token', token);
        }

        // Guardar correo como identificador de sesión
        sessionStorage.setItem('correo', this.correo);

        if (user && typeof user === 'object') {
          const toSessionString = (val: any): string | null => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'string') {
              const s = val.trim();
              return s ? s : null;
            }
            if (typeof val === 'number' || typeof val === 'boolean') return String(val);
            if (typeof val === 'object') {
              const id =
                (val as any)?.id ??
                (val as any)?.ID_academia ??
                (val as any)?.idAcademia ??
                (val as any)?.id_academia ??
                (val as any)?.idDocumento ??
                (val as any)?.ID_documento ??
                (val as any)?.id_documento;
              if (id !== null && id !== undefined) return String(id);
              const nombre = (val as any)?.nombre ?? (val as any)?.name;
              if (nombre !== null && nombre !== undefined) {
                const s = String(nombre).trim();
                return s ? s : null;
              }
              const nombreC = (val as any)?.nombreC;
              if (nombreC !== null && nombreC !== undefined) {
                const s = String(nombreC).trim();
                return s ? s : null;
              }
            }
            return null;
          };

          // Guardar datos del usuario según las variables del proyecto
          const name = user?.nombreC || user?.username || user?.name || user?.nombre || null;
          if (name) {
            sessionStorage.setItem('nombreC', name);
            this.auth.setLoggedIn(true, name);
          }

          const roles = extractUserRoles(user);
          this.auth.setRoles(roles);

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

          const sinAcademia = Boolean((user as any)?.sinAcademia);
          const academia = toSessionString(user?.academia);
          if (sinAcademia) sessionStorage.setItem('academia', 'sin_academia');
          else if (academia) sessionStorage.setItem('academia', academia);
          else sessionStorage.removeItem('academia');

          const instructorIndependiente = Boolean((user as any)?.instructorIndependiente);
          const instructor = toSessionString(user?.Instructor ?? user?.instructor);
          if (instructorIndependiente) {
            sessionStorage.setItem('Instructor', 'independiente');
            sessionStorage.setItem('instructor', 'independiente');
          } else if (instructor) {
            sessionStorage.setItem('Instructor', instructor);
            sessionStorage.setItem('instructor', instructor);
          } else {
            sessionStorage.removeItem('Instructor');
            sessionStorage.removeItem('instructor');
          }
        }

        if (sessionStorage.getItem('justVerified')) {
          sessionStorage.removeItem('justVerified');
          sessionStorage.setItem('showWelcomeProfileAlert', 'true');
        }

        await delayRemaining(startedAt);
        this.cargando = false;
        this.unlockScroll();

        const redirect = this.auth.redirectUrl;
        if (redirect) {
          this.auth.redirectUrl = null;
          this.router.navigateByUrl(redirect);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: async (err: HttpErrorResponse) => {
        // Mantener scroll bloqueado mientras se muestre el modal

        // Mensajes de error según el código de estado HTTP
        if (err.status === 401) {
          // 401 = No autorizado (credenciales incorrectas)
          const mensaje = err.error?.message || err.error?.error || '';
          if (mensaje.toLowerCase().includes('contraseña') || mensaje.toLowerCase().includes('password')) {
            this.mensajeError = 'Contraseña incorrecta. Intenta de nuevo.';
          } else if (mensaje.toLowerCase().includes('correo') || mensaje.toLowerCase().includes('email')) {
            this.mensajeError = 'Este correo no está registrado.';
          } else {
            this.mensajeError = 'Correo o contraseña incorrectos.';
          }
        } else if (err.status === 404) {
          // 404 = Usuario no encontrado
          this.mensajeError = 'Este correo no está registrado.';
        } else if (err.status === 403) {
          // 403 = Cuenta bloqueada o no verificada
          this.mensajeError = err.error?.message || 'Tu cuenta no está activa. Revisa tu correo.';
        } else if (err.status === 0) {
          // Sin conexión al servidor
          this.mensajeError = 'No se puede conectar con el servidor. Revisa tu conexión.';
        } else {
          // Otros errores
          this.mensajeError = err.error?.message || err.error?.error || err.statusText || 'No se pudo iniciar sesión. Intenta de nuevo.';
        }

        await delayRemaining(startedAt);
        this.cargando = false;

        if (this.mensajeError) this.lockScroll();
        else this.unlockScroll();
      }
    });
  }

  cerrarError() {
    this.mensajeError = null;
    this.unlockScroll();
  }

  ngOnDestroy(): void {
    this.unlockScroll();
  }
}
