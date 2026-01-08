import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Location } from '@angular/common';

@Component({
  selector: 'app-my-championships',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './my-championships.component.html',
  styleUrls: ['./my-championships.component.scss']
})
export class MyChampionshipsComponent implements OnInit {
  searchQuery: string = '';
  championships: any[] = [];
  filteredChampionships: any[] = [];

  constructor(private router: Router, private location: Location) {}

  ngOnInit(): void {
    // TODO: Conectar con API cuando esté disponible
    // this.loadChampionships();
    // Por ahora datos dummy para ejemplo
    this.championships = [
      {
        id: 1,
        nombre: 'Campeonato Nacional 2025',
        fecha: '2025-02-15',
        ubicacion: 'Bogotá, Colombia',
        participantes: 45,
        estado: 'Activo'
      },
      {
        id: 2,
        nombre: 'Torneo Regional de Combate',
        fecha: '2025-03-20',
        ubicacion: 'Medellín, Colombia',
        participantes: 32,
        estado: 'Activo'
      },
      {
        id: 3,
        nombre: 'Figuras Internacionales 2025',
        fecha: '2025-04-10',
        ubicacion: 'Virtual',
        participantes: 68,
        estado: 'Planificado'
      }
    ];
    this.filteredChampionships = [...this.championships];
  }

  onSearchChange(): void {
    if (!this.searchQuery.trim()) {
      this.filteredChampionships = [...this.championships];
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredChampionships = this.championships.filter(c =>
        c.nombre.toLowerCase().includes(query) ||
        c.ubicacion.toLowerCase().includes(query)
      );
    }
  }

  goBack(): void {
    this.location.back();
  }

  editChampionship(id: number): void {
    // Navegar a la página de edición
    this.router.navigate(['/campeonato/edit', id]);
  }

  viewDetails(id: number): void {
    // Navegar a detalles
    this.router.navigate(['/campeonato/details', id]);
  }

  deleteChampionship(id: number): void {
    if (confirm('¿Estás seguro de que quieres eliminar este campeonato?')) {
      this.championships = this.championships.filter(c => c.id !== id);
      this.onSearchChange();
    }
  }
}
