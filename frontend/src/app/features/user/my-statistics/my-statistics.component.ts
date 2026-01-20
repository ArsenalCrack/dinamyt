import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Location } from '@angular/common';
import { BackNavigationService } from '../../../core/services/back-navigation.service';

type MyStatRow = {
  championship: string;
  modalidad: string;
  categoria: string;
  puntos: number;
  posicion: number;
  fecha: string;
};

@Component({
  selector: 'app-my-statistics',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './my-statistics.component.html',
  styleUrls: ['./my-statistics.component.scss']
})
export class MyStatisticsComponent implements OnInit {
  searchQuery = '';
  stats: MyStatRow[] = [];
  filtered: MyStatRow[] = [];

  constructor(
    private location: Location,
    private backNav: BackNavigationService
  ) {}

  ngOnInit(): void {
    // TODO: Conectar con API cuando esté disponible.
    // Datos dummy para maquetación inicial.
    this.stats = [
      {
        championship: 'Campeonato Nacional 2025',
        modalidad: 'Combate',
        categoria: 'Senior -67kg',
        puntos: 32,
        posicion: 2,
        fecha: '2025-02-15'
      },
      {
        championship: 'Torneo Regional de Combate',
        modalidad: 'Combate',
        categoria: 'Senior -60kg',
        puntos: 18,
        posicion: 5,
        fecha: '2025-03-20'
      },
      {
        championship: 'Figuras Internacionales 2025',
        modalidad: 'Poomsae',
        categoria: 'Senior Individual',
        puntos: 7.6,
        posicion: 8,
        fecha: '2025-04-10'
      }
    ];
    this.filtered = [...this.stats];
  }

  onSearchChange(): void {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.filtered = [...this.stats];
      return;
    }
    this.filtered = this.stats.filter(r =>
      r.championship.toLowerCase().includes(q) ||
      r.modalidad.toLowerCase().includes(q) ||
      r.categoria.toLowerCase().includes(q)
    );
  }

  goBack(): void {
    this.backNav.backOr({ fallbackUrl: '/dashboard' });
  }
}
