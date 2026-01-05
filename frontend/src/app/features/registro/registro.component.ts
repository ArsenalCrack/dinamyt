import { Component,OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './registro.component.html',
  styleUrls: ['./registro.component.scss']
})
export class RegistroComponent {

  private api = inject(ApiService);
  Mensajes: string = '';

  idDocumento!: number;
  nombreC!: string;
  sexo!: string;
  nacionalidad!: string;
  correo!: string;
  contrasena!: string;

  registrar() {
    const usuario = {
      idDocumento: this.idDocumento,
      nombreC: this.nombreC,
      sexo: this.sexo,
      nacionalidad: this.nacionalidad,
      correo: this.correo,
      contrasena: this.contrasena
    };

    console.log(usuario);

     this.api.registrarUsuario(usuario).subscribe({
    next: (res) => {
      console.log('Usuario recibido por el backend:', res);
    },
    error: (err) => {
      this.Mensajes = err.error;
      console.error('Error al registrar:', err.error);
    }
  });
  }
}
