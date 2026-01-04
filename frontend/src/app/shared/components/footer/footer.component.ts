import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule], // Importante para usar *ngIf
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent implements OnInit {

  private api = inject(ApiService);
  estadoBackend: string = 'Comprobando...';

  ngOnInit() {
    this.api.getSaludo().subscribe({
      next: (data) => { this.estadoBackend = 'Online'; },
      error: () => { this.estadoBackend = 'Offline'; }
    });
  }
}
