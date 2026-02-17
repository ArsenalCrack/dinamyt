import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { delayRemaining } from '../../../core/utils/spinner-timing.util';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';


@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LoadingSpinnerComponent],
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
  emailUsuario: string = ''; // Correo cargado desde sesión
  modo: 'register' | 'recovery' = 'register'; // Modo de verificación

  // Variables de estado
  mensaje: string = '';
  exito: boolean = false;
  cargando: boolean = false;
  textoCarga: string = 'Verificando...';
  // Temporizador
  expiresAt: number | null = null;
  remainingMs: number = 0;
  expired: boolean = false;
  private timerHandle: any = null;
  private expiredHandled: boolean = false;
  codeNotMatchModalVisible: boolean = false;
  // Resend Cooldown
  resendExpiresAt: number | null = null;
  resendRemainingSeconds: number = 0;
  private resendTimerHandle: any = null;

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

    // Cargar expiración del código desde sessionStorage
    const exp = sessionStorage.getItem('verifyExpiresAt');
    if (exp) {
      this.expiresAt = Number(exp);
    } else {
      this.expiresAt = Date.now() + 5 * 60 * 1000;
      sessionStorage.setItem('verifyExpiresAt', String(this.expiresAt));
    }

    // Cargar cooldown de reenvío desde localStorage
    const resendExp = localStorage.getItem('verifyResendExpiresAt');
    if (resendExp) {
      const t = Number(resendExp);
      if (t > Date.now()) {
        this.resendExpiresAt = t;
        this.startResendTimer();
      } else {
        localStorage.removeItem('verifyResendExpiresAt');
      }
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
    this.textoCarga = 'Verificando...';
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
        // Mantener el spinner mientras redirige
        this.cargando = true;
        this.textoCarga = 'Abriendo...';
        this.exito = true;
        this.mensaje = 'Código verificado. Continuamos...';

        // Limpiar cooldown al verificar exitosamente
        localStorage.removeItem('verifyResendExpiresAt');

        await delayRemaining(startedAt);
        this.unlockScroll();
        if (this.modo === 'register') {
          sessionStorage.removeItem('emailParaVerificar');
          sessionStorage.removeItem('verifyMode');
          sessionStorage.removeItem('verifyExpiresAt');
          // Indicar que acabó de verificar para mostrar alerta en el dashboard
          sessionStorage.setItem('justVerified', 'true');
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
    if (this.resendRemainingSeconds > 0) return;

    this.cargando = true;
    this.textoCarga = 'Enviando...';
    this.lockScroll();
    this.mensaje = '';
    const startedAt = Date.now();

    this.api.reenviarCodigo(this.emailUsuario).subscribe({
      next: async (res: any) => {
        this.exito = true;
        this.mensaje = 'Enviamos un nuevo código. Revisa tu correo.';

        // 1. Resetear expiración del código (5 min)
        const expires = Date.now() + 5 * 60 * 1000;
        sessionStorage.setItem('verifyExpiresAt', String(expires));
        this.expiresAt = expires;
        this.expired = false;
        this.expiredHandled = false;
        this.expiredModalVisible = false;
        this.startTimer();

        // 2. Iniciar cooldown de reenvío (1 min)
        this.resendExpiresAt = Date.now() + 60 * 1000;
        localStorage.setItem('verifyResendExpiresAt', String(this.resendExpiresAt));
        this.startResendTimer();

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

  startResendTimer() {
    if (this.resendTimerHandle) clearInterval(this.resendTimerHandle);
    this.updateResendRemaining();
    this.resendTimerHandle = setInterval(() => this.updateResendRemaining(), 1000);
  }

  updateResendRemaining() {
    if (!this.resendExpiresAt) {
      this.resendRemainingSeconds = 0;
      return;
    }
    const diff = Math.ceil((this.resendExpiresAt - Date.now()) / 1000);
    this.resendRemainingSeconds = diff > 0 ? diff : 0;

    if (this.resendRemainingSeconds <= 0 && this.resendTimerHandle) {
      clearInterval(this.resendTimerHandle);
      this.resendTimerHandle = null;
      localStorage.removeItem('verifyResendExpiresAt');
    }
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
    // Si el código expiró y aún no se ha manejado, mostrar mensaje y redirigir
    if (this.expired && !prev && !this.expiredHandled) {
      this.handleExpiration();
    }
  }

  handleExpiration() {
    this.expiredHandled = true;
    this.mensaje = 'El código ha caducado.';
    this.exito = false;
    // Mostrar modal y esperar a que el usuario cierre
    this.expiredModalVisible = true;
  }

  expiredModalVisible = false;

  closeExpiredModal() {
    // Cerrar el modal y permanecer en la página de verificación
    this.expiredModalVisible = false;
    this.mensaje = 'El código ha caducado. Reenvía para obtener uno nuevo.';
    this.exito = false;
    this.unlockScroll();
  }

  closeCodeNotMatchModal() {
    // Cerrar el modal y limpiar el código para reintentar
    this.codeNotMatchModalVisible = false;
    this.codigo = '';
    this.mensaje = '';
    this.unlockScroll();
  }

  validateNumberInput(event: any) {
    const input = event.target as HTMLInputElement;
    let value = input.value;

    // Eliminar caracteres no numéricos
    value = value.replace(/[^0-9]/g, '');

    // Limitar a 6 caracteres
    if (value.length > 6) {
      value = value.substring(0, 6);
    }

    // Actualizar input y modelo
    input.value = value;
    this.codigo = value;
  }

  formatRemaining(): string {
    const total = Math.max(0, this.remainingMs);
    const sec = Math.floor(total / 1000);
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  ngOnDestroy(): void {
    this.unlockScroll();
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.resendTimerHandle) {
      clearInterval(this.resendTimerHandle);
      this.resendTimerHandle = null;
    }
  }
}
