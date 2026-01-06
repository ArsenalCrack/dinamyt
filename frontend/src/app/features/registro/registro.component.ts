import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Location } from '@angular/common';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './registro.component.html',
  styleUrls: ['./registro.component.scss']
})
export class RegistroComponent implements OnInit {

  private api = inject(ApiService);
  private router = inject(Router);
  private location = inject(Location);


  // VARIABLES PARA VISIBILIDAD DE CONTRASEÑA
  mostrarPass: boolean = false;
  mostrarConfirmPass: boolean = false;

  Mensajes: string = '';
  exito: boolean = false;

  // Datos del modelo
  idDocumento!: number;
  nombreC!: string;
  sexo: string = '';
  nacionalidad: string = '';
  fechaNacimiento!: string;
  correo!: string;
  contrasena!: string;
  confirmPassword!: string;

  // Variable para validar la edad (Mínimo 4 años)
  fechaMaximaPermitida!: string;

  volverAtras() {
    this.location.back();
  }


  ngOnInit() {
    this.calcularFechaMaxima();
  }

  // Calcula la fecha de hoy hace 4 años
  calcularFechaMaxima() {
    const hoy = new Date();
    const haceCuatroAnios = new Date(hoy.getFullYear() - 4, hoy.getMonth(), hoy.getDate());
    // Formato YYYY-MM-DD para el input HTML
    this.fechaMaximaPermitida = haceCuatroAnios.toISOString().split('T')[0];
  }

  registrar() {
    if (this.contrasena !== this.confirmPassword) {
      this.Mensajes = "Las contraseñas no coinciden";
      return;
    }

    const usuario = {
      idDocumento: this.idDocumento,
      nombreC: this.nombreC.trim(), // Limpiamos espacios extra
      sexo: this.sexo,
      nacionalidad: this.nacionalidad,
      fechaNacimiento: this.fechaNacimiento,
      correo: this.correo,
      contrasena: this.contrasena
    };

    console.log('Enviando usuario:', usuario);

    this.api.registrarUsuario(usuario).subscribe({
      next: (res) => {
        this.exito = true;
        this.Mensajes = "¡Formulario exitoso! Redirigiendo...";
        sessionStorage.setItem('verifyMode', 'register');
        sessionStorage.setItem('emailParaVerificar', this.correo);
        setTimeout(() => this.router.navigate(['/verify']), 1500);
      },
      error: (err) => {
        this.exito = false;
        this.Mensajes = err.error?.message;
      }
    });
  }
}
