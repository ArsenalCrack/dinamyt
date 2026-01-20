import { Component, inject, OnInit, AfterViewInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { Location } from '@angular/common';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { delayRemaining, DEFAULT_MIN_SPINNER_MS } from '../../../core/utils/spinner-timing.util';
import { BackNavigationService } from '../../../core/services/back-navigation.service';

@Component({
  selector: 'app-confirm-email',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './confirm-email.component.html',
  styleUrls: ['./confirm-email.component.scss']
})
export class ConfirmEmailComponent implements OnInit, AfterViewInit, OnDestroy {

  showExpiredBanner = false;
  @ViewChild('bannerResendBtn') bannerResendBtn?: ElementRef<HTMLButtonElement>;

  private api = inject(ApiService);
  private router = inject(Router);
  private location = inject(Location);
  private scrollLock = inject(ScrollLockService);
  private backNav = inject(BackNavigationService);

  private modalLocked = false;

  correo: string = '';
  cargando: boolean = false;
  redirigiendo: boolean = false;
  mensaje: string = '';
  exito: boolean = false;

  private readonly MSG_VISIBLE_MS = DEFAULT_MIN_SPINNER_MS;
  private readonly REDIRECT_SPINNER_MS = DEFAULT_MIN_SPINNER_MS;
  private redirectTimer: number | null = null;
  private navigateTimer: number | null = null;

  private clearTimers(): void {
    if (this.redirectTimer !== null) {
      window.clearTimeout(this.redirectTimer);
      this.redirectTimer = null;
    }
    if (this.navigateTimer !== null) {
      window.clearTimeout(this.navigateTimer);
      this.navigateTimer = null;
    }
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

  closeMensaje() {
    this.mensaje = '';
    this.unlockScroll();
  }

  volverAtras() {
    this.backNav.backOr({ fallbackUrl: '/' });
  }

  enviarCodigo() {
    this.clearTimers();
    this.cargando = true;
    this.redirigiendo = false;
    this.lockScroll();
    this.mensaje = '';
    this.exito = false;
    const startedAt = Date.now();

    // Llamamos al servicio (Asegúrate de crear este método en api.service.ts)
    this.api.solicitarRecuperacion(this.correo).subscribe({
      next: async (res) => {
        await delayRemaining(startedAt);
        this.cargando = false;
        this.exito = true;

        // ¡CLAVE! Aquí guardamos el permiso para que el Guard deje entrar a /verify
        sessionStorage.setItem('verifyMode', 'recovery');
        sessionStorage.setItem('emailParaVerificar', this.correo);
        // Guardar expiración del código: 5 minutos desde ahora
        const expires = Date.now() + 5 * 60 * 1000;
        sessionStorage.setItem('verifyExpiresAt', String(expires));

        this.mensaje = 'Código enviado.';

        // Mostrar mensaje primero, luego spinner de redirección, y finalmente navegar
        this.unlockScroll();
        this.redirectTimer = window.setTimeout(() => {
          this.redirigiendo = true;
          this.lockScroll();
          this.navigateTimer = window.setTimeout(() => {
            this.redirigiendo = false;
            this.unlockScroll();
            this.router.navigate(['/verify']);
          }, this.REDIRECT_SPINNER_MS);
        }, this.MSG_VISIBLE_MS);
      },
      error: async (err) => {
        await delayRemaining(startedAt);
        this.cargando = false;
        this.redirigiendo = false;
        this.exito = false;
        this.mensaje = err.error?.message;
        if (this.mensaje) this.lockScroll();
      }
    });
  }

  ngOnInit(): void {
    const flag = sessionStorage.getItem('verifyExpiredRedirect');
    if (flag === 'recovery') {
      // show banner and prefill email if possible
      this.showExpiredBanner = true;
      this.correo = this.correo || (sessionStorage.getItem('emailParaVerificar') || '');
      sessionStorage.removeItem('verifyExpiredRedirect');
    }
  }

  ngAfterViewInit(): void {
    if (this.showExpiredBanner && this.bannerResendBtn) {
      setTimeout(() => this.bannerResendBtn?.nativeElement.focus(), 120);
    }
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.unlockScroll();
  }
}
