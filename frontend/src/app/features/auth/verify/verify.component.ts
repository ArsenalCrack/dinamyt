import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { delayRemaining } from '../../../core/utils/spinner-timing.util';


@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './verify.component.html',
  styleUrls: ['./verify.component.scss']
})
export class VerifyComponent implements OnInit, OnDestroy {

  private api = inject(ApiService);
  private router = inject(Router);
  private scrollLock = inject(ScrollLockService);

  private modalLocked = false;


  // Variables del formulario
  codigo: string = '';
  emailUsuario: string = ''; // Aquí deberías cargar el correo desde un servicio o el estado
  modo: 'register' | 'recovery' = 'register'; // Modo de verificación

  // Variables de estado
  mensaje: string = '';
  exito: boolean = false;
  cargando: boolean = false;
  loadingText: string = 'Verificando...';
  // Temporizador
  expiresAt: number | null = null;
  remainingMs: number = 0;
  expired: boolean = false;
  private timerHandle: any = null;
  private expiredHandled: boolean = false;
  codeNotMatchModalVisible: boolean = false;
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

  private lockScroll() {
    if (this.modalLocked) return;
    this.scrollLock.lock();
    this.modalLocked = true;
  }

  private unlockScroll() {
    if (!this.modalLocked) return;
    this.scrollLock.unlock();
    this.modalLocked = false;
  }

  verificar() {
    if (this.codigo.length !== 6) return;
    if (this.expired) {
      this.mensaje = 'El código venció. Reenvía uno nuevo.';
      this.exito = false;
      return;
    }

    this.cargando = true;
    this.loadingText = 'Verificando...';
    this.lockScroll();
    this.mensaje = '';
    const startedAt = Date.now();
    const datos = {
      codigo: this.codigo,
      correo: this.emailUsuario,
      modo: this.modo
    };
    this.api.verificarCodigo(datos).subscribe({
      next: async (rest: any) => {
        // mantener spinner mientras redirige
        this.cargando = true;
        this.loadingText = 'Abriendo...';
        this.exito = true;
        this.mensaje = 'Código verificado. Continuamos...';

        await delayRemaining(startedAt);
        this.unlockScroll();
        if (this.modo === 'register') {
          sessionStorage.removeItem('emailParaVerificar');
          sessionStorage.removeItem('verifyMode');
          sessionStorage.removeItem('verifyExpiresAt');
          this.router.navigate(['/login']);
        } else if (this.modo === 'recovery') {
          sessionStorage.removeItem('verifyExpiresAt');
          this.router.navigate(['/resetPassword']);
        }
      },
      error: async (err) => {
        this.exito = false;
        this.mensaje = err.error?.message || 'Código incorrecto. Intenta de nuevo.';
        this.codeNotMatchModalVisible = true;
        this.lockScroll();

        await delayRemaining(startedAt);
        this.cargando = false;
      }
    });
  }


  reenviarCodigo() {
    this.cargando = true;
    this.loadingText = 'Verificando...';
    this.lockScroll();
    this.mensaje = '';
    const startedAt = Date.now();

    this.api.reenviarCodigo(this.emailUsuario).subscribe({
      next: async (res: any) => {
        this.exito = true; // Usamos true para mostrar mensaje en verde
        this.mensaje = 'Enviamos un nuevo código. Revisa tu correo.';
        // actualizar expiración a 5 minutos desde ahora
        const expires = Date.now() + 5 * 60 * 1000;
        sessionStorage.setItem('verifyExpiresAt', String(expires));
        this.expiresAt = expires;
        // Resetear estado de expiración para permitir manejar nuevas caducidades
        this.expired = false;
        this.expiredHandled = false;
        this.expiredModalVisible = false;
        this.startTimer();

        await delayRemaining(startedAt);
        this.cargando = false;
        this.unlockScroll();
      },
      error: async (err) => {
        this.exito = false;
        this.mensaje = 'No pudimos reenviar el código. Intenta más tarde.';

        await delayRemaining(startedAt);
        this.cargando = false;
        this.unlockScroll();
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
    this.unlockScroll();
  }

  closeCodeNotMatchModal() {
    // Cerrar el modal y limpiar el código para que intente nuevamente
    this.codeNotMatchModalVisible = false;
    this.codigo = '';
    this.mensaje = '';
    this.unlockScroll();
  }

  formatRemaining(): string {
    const total = Math.max(0, this.remainingMs);
    const sec = Math.floor(total / 1000);
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
    this.lockScroll();
  }

  ngOnDestroy(): void {
    this.unlockScroll();
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
