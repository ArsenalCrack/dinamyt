import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service'; // Ajusta la ruta si es necesario

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent implements OnInit {

  private api = inject(ApiService);
  estadoBackend: string = 'Comprobando...';

  ngOnInit() {
    this.api.getSaludo().subscribe({
      next: (datos) => { this.estadoBackend = datos.estado; },
      error: () => { this.estadoBackend = 'Offline'; }
    });
  }
}
