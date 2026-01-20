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

  mensajeBackend: string = 'Conectando...';
  estadoBackend: string = 'Sin verificar';

  constructor() {}

  ngOnInit() {
    this.api.getSaludo().subscribe({
      next: (datos) => {
        this.mensajeBackend = (datos as any)?.mensaje || 'Servidor en línea';
        this.estadoBackend = (datos as any)?.estado || 'Online';
      },
      error: (error) => {
        this.mensajeBackend = 'No se puede conectar con el servidor.';
        this.estadoBackend = 'Offline';
      }
    });
  }
}
