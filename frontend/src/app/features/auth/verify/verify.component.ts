import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';


@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './verify.component.html',
  styleUrls: ['./verify.component.scss']
})
export class VerifyComponent implements OnInit {

  private api = inject(ApiService);
  private router = inject(Router);


  // Variables del formulario
  codigo: string = '';
  emailUsuario: string = ''; // Aquí deberías cargar el correo desde un servicio o el estado
  modo: 'register' | 'recovery' = 'register'; // Modo de verificación

  // Variables de estado
  mensaje: string = '';
  exito: boolean = false;
  cargando: boolean = false;
  // Temporizador
  expiresAt: number | null = null;
  remainingMs: number = 0;
  expired: boolean = false;
  private timerHandle: any = null;
  private expiredHandled: boolean = false;
  ngOnInit() {
    this.emailUsuario = sessionStorage.getItem('emailParaVerificar') || '';

    const modoGuard = sessionStorage.getItem('verifyMode');
    if (modoGuard === 'recovery') {
      this.modo = 'recovery';
    } else {
      this.modo = 'register';
    }

    if (!this.emailUsuario) {
      this.router.navigate(['/login']);
    }

    // Cargar expiración desde sessionStorage (si existe)
    const exp = sessionStorage.getItem('verifyExpiresAt');
    if (exp) {
      this.expiresAt = Number(exp);
    } else {
      // Si no existe, crear una expiración por seguridad
      this.expiresAt = Date.now() + 5 * 60 * 1000;
      sessionStorage.setItem('verifyExpiresAt', String(this.expiresAt));
    }

    this.startTimer();
  }

  verificar() {
  if (this.codigo.length !== 6) return;
  if (this.expired) {
    this.mensaje = 'El código ha caducado. Solicita uno nuevo.';
    this.exito = false;
    return;
  }

  this.cargando = true;
  this.mensaje = '';

  this.api.verificarCodigo(this.codigo).subscribe({
    next: (rest: any) => {
      this.cargando = false;
      this.exito = true;
      this.mensaje = 'Código verificado correctamente. Redirigiendo...';

      setTimeout(() => {
        if (this.modo === 'register') {
          sessionStorage.removeItem('emailParaVerificar');
          sessionStorage.removeItem('verifyMode');
          sessionStorage.removeItem('verifyExpiresAt');
          this.router.navigate(['/login']);
        } else if (this.modo === 'recovery') {
          sessionStorage.removeItem('verifyExpiresAt');
          this.router.navigate(['/resetPassword']);
        }
      }, 2000);
    },
    error: (err) => {
      this.cargando = false;
      this.exito = false;
      this.mensaje = err.error?.message;
    }
  });
}


  reenviarCodigo() {
    this.cargando = true;
    this.mensaje = '';

    this.api.reenviarCodigo(this.emailUsuario).subscribe({
      next: (res: any) => {
        this.cargando = false;
        this.exito = true; // Usamos true para mostrar mensaje en verde
        this.mensaje = 'Nuevo código enviado. Revisa tu bandeja de entrada.';
        // actualizar expiración a 5 minutos desde ahora
        const expires = Date.now() + 5 * 60 * 1000;
        sessionStorage.setItem('verifyExpiresAt', String(expires));
        this.expiresAt = expires;
        // Resetear estado de expiración para permitir manejar nuevas caducidades
        this.expired = false;
        this.expiredHandled = false;
        this.expiredModalVisible = false;
        this.startTimer();
      },
      error: (err) => {
        this.cargando = false;
        this.exito = false;
        this.mensaje = 'No se pudo reenviar el código. Intenta más tarde.';
      }
    });
  }

  startTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
    }
    this.updateRemaining();
    this.timerHandle = setInterval(() => this.updateRemaining(), 1000);
  }

  updateRemaining() {
    if (!this.expiresAt) return;
    const now = Date.now();
    this.remainingMs = Math.max(0, this.expiresAt - now);
    const prev = this.expired;
    this.expired = this.remainingMs <= 0;
    if (this.expired && this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    // Si acabó y no lo hemos manejado aún, mostrar mensaje y redirigir
    if (this.expired && !prev && !this.expiredHandled) {
      this.handleExpiration();
    }
  }

  handleExpiration() {
    this.expiredHandled = true;
    this.mensaje = 'El código ha caducado.';
    this.exito = false;
    // mostrar modal y esperar a que el usuario cierre
    this.expiredModalVisible = true;
  }

  expiredModalVisible = false;

  closeExpiredModal() {
    // Solo cerrar el modal y permanecer en la página de verificación
    this.expiredModalVisible = false;
    this.mensaje = 'El código ha caducado. Reenvía para obtener uno nuevo.';
    this.exito = false;
  }

  formatRemaining(): string {
    const total = Math.max(0, this.remainingMs);
    const sec = Math.floor(total / 1000);
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  ngOnDestroy(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
