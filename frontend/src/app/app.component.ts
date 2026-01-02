import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApiService } from './services/api.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  mensajeBackend: string = 'Esperando conexión...';
  estadoBackend: string = 'Desconocido';

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getSaludo().subscribe({
      next: (datos) => {
        this.mensajeBackend = datos.mensaje;
        this.estadoBackend = datos.estado;
      },
      error: (error) => {
        console.error('Error conectando:', error);
        this.mensajeBackend = 'Error: El backend está apagado o bloqueado.';
        this.estadoBackend = 'Offline';
      }
    });
  }
}
