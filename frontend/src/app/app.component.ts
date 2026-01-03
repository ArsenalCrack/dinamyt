import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { ApiService } from './core/services/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    CommonModule,
    NavbarComponent,
    FooterComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {

  private api = inject(ApiService);

  mensajeBackend: string = 'Esperando conexión...';
  estadoBackend: string = 'Desconocido';

  constructor() {}

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
