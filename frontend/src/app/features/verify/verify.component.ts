import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';


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
  ngOnInit() {
    // Intentar recuperar el correo del usuario registrado (si lo guardaste en el servicio/localStorage)
    // Por ahora pondremos un placeholder o lo recuperamos del localStorage si existe
    this.emailUsuario = sessionStorage.getItem('emailParaVerificar') || '';

    // Doble seguridad: Si por alguna razón está vacío (aunque el guard lo evita), lo sacamos
    if (!this.emailUsuario) {
      this.router.navigate(['/login']);
    }

    this.emailUsuario = localStorage.getItem('correoRegistro') || 'tu correo';
  }

  verificar() {
  if (this.codigo.length !== 6) return;

  this.cargando = true;
  this.mensaje = '';

  this.api.verificarCodigo(this.codigo).subscribe({
    next: (rest: any): => {
      this.cargando = false;
      this.exito = true;
      this.mensaje = 'Código verificado correctamente. Redirigiendo...';

      // Limpieza
      sessionStorage.removeItem('emailParaVerificar');
      sessionStorage.removeItem('verifyMode');

      setTimeout(() => {
        if (this.modo === 'register') {
          this.router.navigate(['/login']);
        } else if (this.modo === 'recovery') {
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
      next: (res) => {
        this.cargando = false;
        this.exito = true; // Usamos true para mostrar mensaje en verde
        this.mensaje = 'Nuevo código enviado. Revisa tu bandeja de entrada.';
      },
      error: (err) => {
        this.cargando = false;
        this.exito = false;
        this.mensaje = 'No se pudo reenviar el código. Intenta más tarde.';
      }
    });
  }
}
