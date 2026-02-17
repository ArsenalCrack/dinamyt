import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Location } from '@angular/common';
import { BackNavigationService } from '../../../core/services/back-navigation.service';

type FilaEstadistica = {
  campeonato: string;
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
  busqueda = '';
  estadisticas: FilaEstadistica[] = [];
  filtradas: FilaEstadistica[] = [];

  constructor(
    private location: Location,
    private backNav: BackNavigationService
  ) { }

  ngOnInit(): void {
    // TODO: Conectar con API cuando esté disponible.
    // Datos dummy para maquetación inicial.
    this.estadisticas = [
      {
        campeonato: 'Campeonato Nacional 2025',
        modalidad: 'Combate',
        categoria: 'Senior -67kg',
        puntos: 32,
        posicion: 2,
        fecha: '2025-02-15'
      },
      {
        campeonato: 'Torneo Regional de Combate',
        modalidad: 'Combate',
        categoria: 'Senior -60kg',
        puntos: 18,
        posicion: 5,
        fecha: '2025-03-20'
      },
      {
        campeonato: 'Figuras Internacionales 2025',
        modalidad: 'Poomsae',
        categoria: 'Senior Individual',
        puntos: 7.6,
        posicion: 8,
        fecha: '2025-04-10'
      }
    ];
    this.filtradas = [...this.estadisticas];
  }

  onBusquedaCambio(): void {
    const q = this.busqueda.trim().toLowerCase();
    if (!q) {
      this.filtradas = [...this.estadisticas];
      return;
    }
    this.filtradas = this.estadisticas.filter(r =>
      r.campeonato.toLowerCase().includes(q) ||
      r.modalidad.toLowerCase().includes(q) ||
      r.categoria.toLowerCase().includes(q)
    );
  }

  volverAtras(): void {
    this.backNav.backOr({ fallbackUrl: '/dashboard' });
  }
}
