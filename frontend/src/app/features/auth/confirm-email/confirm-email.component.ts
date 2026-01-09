import { Component, inject, OnInit, AfterViewInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { Location } from '@angular/common';

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

  correo: string = '';
  cargando: boolean = false;
  mensaje: string = '';
  exito: boolean = false;

  private lockScroll() { document.body.style.overflow = 'hidden'; }
  private unlockScroll() { document.body.style.overflow = ''; }

  closeMensaje() {
    this.mensaje = '';
  }

  volverAtras() {
    this.location.back();
  }

  enviarCodigo() {
    this.cargando = true;
    this.lockScroll();
    this.mensaje = '';
    this.exito = false;

    // Llamamos al servicio (Asegúrate de crear este método en api.service.ts)
    this.api.solicitarRecuperacion(this.correo).subscribe({
      next: (res) => {
        this.cargando = false;
        this.unlockScroll();
        this.exito = true;

        // ¡CLAVE! Aquí guardamos el permiso para que el Guard deje entrar a /verify
        sessionStorage.setItem('verifyMode', 'recovery');
        sessionStorage.setItem('emailParaVerificar', this.correo);
        // Guardar expiración del código: 5 minutos desde ahora
        const expires = Date.now() + 5 * 60 * 1000;
        sessionStorage.setItem('verifyExpiresAt', String(expires));

        this.mensaje = 'Código enviado.';

        // Redirigimos a la pantalla de poner el código
        setTimeout(() => this.router.navigate(['/verify']), 1500);
      },
      error: (err) => {
        this.cargando = false;
        this.unlockScroll();
        this.exito = false;
        this.mensaje = err.error?.message;
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
    this.unlockScroll();
  }
}
