import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit, OnDestroy {

  private api = inject(ApiService);
  private router = inject(Router);

  // Variable del correo (recuperado de sesión)
  correo: string = '';

  // Modelo (Aquí corregimos el nombre para que coincida con el HTML y BD)
  contrasena: string = '';
  confirmPassword: string = '';

  // Visibilidad
  mostrarPass: boolean = false;
  mostrarConfirm: boolean = false;

  // Estado
  cargando: boolean = false;
  mensaje: string = '';
  exito: boolean = false;

  ngOnInit() {
    // Recuperamos el correo usando la clave que definimos antes
    this.correo = sessionStorage.getItem('emailParaVerificar') || '';

    // Si no hay correo, lo sacamos (protección extra al Guard)
    if (!this.correo) {
      this.router.navigate(['/login']);
    }
  }

  private lockScroll() { document.body.style.overflow = 'hidden'; }
  private unlockScroll() { document.body.style.overflow = ''; }

  cambiarPassword() {
    if (this.contrasena !== this.confirmPassword) {
      this.mensaje = 'Las contraseñas no coinciden.';
      return;
    }

    this.cargando = true;
    this.mensaje = '';
    this.lockScroll();

    const payload = {
      correo: this.correo,
      contrasena: this.contrasena, // Enviamos 'contrasena' al backend
      modo: "recuperar"
    };

    this.api.cambiarPassword(payload).subscribe({
      next: (res) => {
        this.cargando = false;
        this.unlockScroll();
        this.exito = true;
        this.mensaje = 'Contraseña actualizada correctamente.';

        // LIMPIEZA: Usamos los nombres correctos de tus variables de sesión
        sessionStorage.removeItem('emailParaVerificar');
        sessionStorage.removeItem('verifyMode');

        // Al login
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: (err) => {
        this.cargando = false;
        this.unlockScroll();
        this.exito = false;
        const msgRaw = (err?.error?.message || err?.error?.error || '').toString().toLowerCase();
        if (msgRaw.includes('utilizada') || msgRaw.includes('reutilizada') || msgRaw.includes('usada') || msgRaw.includes('reused') || msgRaw.includes('already')) {
          this.mensaje = 'Esta contraseña ya fue utilizada anteriormente. Por favor, elige una contraseña diferente.';
        } else if (msgRaw.includes('deb') || msgRaw.includes('weak')) {
          this.mensaje = 'La nueva contraseña no cumple los requisitos de seguridad.';
        } else {
          this.mensaje = err.error?.message || 'Error al actualizar la contraseña.';
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.unlockScroll();
  }
}
