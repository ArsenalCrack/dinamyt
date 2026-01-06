import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Location } from '@angular/common';

@Component({
  selector: 'app-confirm-email',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './confirm-email.component.html',
  styleUrls: ['./confirm-email.component.scss']
})
export class ConfirmEmailComponent {

  private api = inject(ApiService);
  private router = inject(Router);
  private location = inject(Location);

  correo: string = '';
  cargando: boolean = false;
  mensaje: string = '';
  exito: boolean = false;

  volverAtras() {
    this.location.back();
  }

  enviarCodigo() {
    this.cargando = true;
    this.mensaje = '';
    this.exito = false;

    // Llamamos al servicio (Asegúrate de crear este método en api.service.ts)
    this.api.solicitarRecuperacion(this.correo).subscribe({
      next: (res) => {
        this.cargando = false;
        this.exito = true;

        // ¡CLAVE! Aquí guardamos el permiso para que el Guard deje entrar a /verify
        sessionStorage.setItem('verifyMode', 'recovery');
        sessionStorage.setItem('emailParaVerificar', this.correo);

        this.mensaje = 'Código enviado. Redirigiendo...';

        // Redirigimos a la pantalla de poner el código
        setTimeout(() => this.router.navigate(['/verify']), 1500);
      },
      error: (err) => {
        this.cargando = false;
        this.exito = false;
        this.mensaje = err.error?.message;
      }
    });
  }
}
