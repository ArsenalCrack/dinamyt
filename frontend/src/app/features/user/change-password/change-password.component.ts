import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.scss']
})
export class ChangePasswordComponent implements OnDestroy {
  actual = '';
  nueva = '';
  confirmar = '';
  cargando = false;
  mensaje: string | null = null;
  exito = false;

  mostrarActual = false;
  mostrarNueva = false;
  mostrarConfirm = false;

  constructor(private api: ApiService, private router: Router, private location: Location) {}

  goBack(): void {
    this.location.back();
  }

  private lockScroll() { document.body.style.overflow = 'hidden'; }
  private unlockScroll() { document.body.style.overflow = ''; }

  submit() {
    this.mensaje = null;
    if (!this.nueva || this.nueva.length < 8) {
      this.mensaje = 'La nueva contraseña debe tener al menos 8 caracteres.';
      return;
    }
    if (this.nueva !== this.confirmar) {
      this.mensaje = 'Las contraseñas no coinciden.';
      return;
    }
    this.cargando = true;
    this.lockScroll();
    const payload: any = { 
      correo: sessionStorage.getItem("correo"),
      contrasena: this.actual, 
      codigo: this.nueva,//nueva contraseña toca acomodarlo asi para que llegue xd
      modo: "cambiar"
    };
    this.api.cambiarPassword(payload).subscribe({
      next: () => {
        this.exito = true;
        this.mensaje = 'Contraseña actualizada correctamente.';
        setTimeout(() => {
          this.unlockScroll();
          this.router.navigate(['/perfil']);
        }, 1200);
      },
      error: (err) => {
        this.exito = false;
        const msgRaw = (err?.error?.message || err?.error?.error || '').toString().toLowerCase();
        if (msgRaw.includes('actual') && (msgRaw.includes('incorrecta') || msgRaw.includes('invalida') || msgRaw.includes('inválida'))) {
          this.mensaje = 'Tu contraseña actual es incorrecta.';
        } else if (msgRaw.includes('utilizada') || msgRaw.includes('reutilizada') || msgRaw.includes('usada') || msgRaw.includes('reused') || msgRaw.includes('already')) {
          this.mensaje = 'Esta contraseña ya fue utilizada anteriormente. Por favor, elige una contraseña diferente.';
        } else if (msgRaw.includes('deb') || msgRaw.includes('weak')) {
          this.mensaje = 'La nueva contraseña no cumple los requisitos de seguridad.';
        } else {
          this.mensaje = err?.error?.message || 'No se pudo cambiar la contraseña.';
        }
        this.cargando = false;
        this.unlockScroll();
      }
    });
  }

  ngOnDestroy(): void {
    this.unlockScroll();
  }
}
