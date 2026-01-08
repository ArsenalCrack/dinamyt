import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Location } from '@angular/common';

@Component({
  selector: 'app-explore-championships',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './explore-championships.component.html',
  styleUrls: ['./explore-championships.component.scss']
})
export class ExploreChampionshipsComponent implements OnInit {
  searchQuery: string = '';
  championships: any[] = [];
  filteredChampionships: any[] = [];
  showLoginModal: boolean = false;

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
        capacidad: 100,
        estado: 'Activo',
        organizador: 'Federación Hapkido Colombia',
        categoria: 'Nacional'
      },
      {
        id: 2,
        nombre: 'Torneo Regional de Combate',
        fecha: '2025-03-20',
        ubicacion: 'Medellín, Colombia',
        participantes: 32,
        capacidad: 80,
        estado: 'Activo',
        organizador: 'Academia Regional',
        categoria: 'Regional'
      },
      {
        id: 3,
        nombre: 'Figuras Internacionales 2025',
        fecha: '2025-04-10',
        ubicacion: 'Virtual',
        participantes: 68,
        capacidad: 150,
        estado: 'Planificado',
        organizador: 'Confederación Internacional',
        categoria: 'Internacional'
      },
      {
        id: 4,
        nombre: 'Copa Local de Defensa Personal',
        fecha: '2025-01-25',
        ubicacion: 'Cali, Colombia',
        participantes: 12,
        capacidad: 50,
        estado: 'Activo',
        organizador: 'Dojo Central Cali',
        categoria: 'Local'
      },
      {
        id: 5,
        nombre: 'Eliminatorias Departamentales',
        fecha: '2025-02-28',
        ubicacion: 'Barranquilla, Colombia',
        participantes: 25,
        capacidad: 60,
        estado: 'Activo',
        organizador: 'Academia Atlántico',
        categoria: 'Departamental'
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
        c.ubicacion.toLowerCase().includes(query) ||
        c.organizador.toLowerCase().includes(query)
      );
    }
  }

  goBack(): void {
    this.location.back();
  }

  registerChampionship(id: number): void {
    // Verificar si el usuario está logueado
    const token = sessionStorage.getItem('token');
    if (!token) {
      this.showLoginModal = true;
      return;
    }

    alert(`Inscripción en campeonato ${id} - En desarrollo`);
    // this.router.navigate(['/inscripcion', id]);
  }

  closeLoginModal(): void {
    this.showLoginModal = false;
  }

  goToLogin(): void {
    this.showLoginModal = false;
    this.router.navigate(['/login']);
  }

  viewDetails(id: number): void {
    // Navegar a detalles
    this.router.navigate(['/campeonato/details', id]);
  }

  getAvailableSlots(participantes: number, capacidad: number): number {
    return capacidad - participantes;
  }

  getProgressPercentage(participantes: number, capacidad: number): number {
    return (participantes / capacidad) * 100;
  }
}
