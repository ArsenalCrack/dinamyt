import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Location } from '@angular/common';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-my-championships',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LoadingSpinnerComponent],
  templateUrl: './my-championships.component.html',
  styleUrls: ['./my-championships.component.scss']
})
export class MyChampionshipsComponent implements OnInit {
  searchQuery: string = '';
  championships: any[] = [];
  filteredChampionships: any[] = [];
  cargando = false;
  errorMessage: string | null = null;

  constructor(
    private router: Router,
    private location: Location,
    private backNav: BackNavigationService,
    private api: ApiService
  ) { }

  ngOnInit(): void {
    this.loadChampionships();
  }

  loadChampionships(): void {
    const userId = sessionStorage.getItem('idDocumento');
    if (!userId) {
      this.errorMessage = 'No se pudo identificar al usuario. Por favor, inicia sesión de nuevo.';
      return;
    }

    this.cargando = true;
    this.errorMessage = null;

    this.api.getMisCampeonatos(userId).subscribe({
      next: (res: any[]) => {
        this.championships = res.map(c => {
          const status = this.calculateStatus(c.fechaInicio, c.fecha_fin);
          return {
            id: c.idCampeonato ?? c.id,
            nombre: c.nombre,
            fecha: c.fechaInicio,
            fechaFin: c.fecha_fin,
            ubicacion: c.ubicacion,
            participantes: c.participantes ?? 0,
            estado: status,
            estadoLabel: this.getEstadoLabel(status)
          };
        });
        this.applyFilters();
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error loading my championships:', err);
        this.cargando = false;
        // Si el backend aún no tiene la ruta, la API devolverá 404 o 500
        if (err.status === 404 || err.status === 500) {
          // Dejamos la lista vacía para que el usuario pueda ver la interfaz lista
          this.championships = [];
          this.applyFilters();
        } else {
          this.errorMessage = 'No pudimos cargar tus campeonatos. Intenta más tarde.';
        }
      }
    });
  }

  private calculateStatus(fechaInicio: string, fechaFin: string | undefined): string {
    if (!fechaInicio) return 'BORRADOR';
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const start = new Date(fechaInicio);
    const startCompare = new Date(start);
    startCompare.setHours(0, 0, 0, 0);

    const end = fechaFin ? new Date(fechaFin) : new Date(start);
    const endCompare = new Date(end);
    endCompare.setHours(23, 59, 59, 999);

    if (now < startCompare) return 'PLANIFICADO';
    if (now > endCompare) return 'TERMINADO';
    return 'ACTIVO';
  }

  private getEstadoLabel(status: string): string {
    switch (status) {
      case 'ACTIVO': return 'Activo';
      case 'PLANIFICADO': return 'Planificado';
      case 'TERMINADO': return 'Terminado';
      default: return 'Borrador';
    }
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

  private applyFilters(): void {
    this.onSearchChange();
  }

  goBack(): void {
    this.backNav.backOr({ fallbackUrl: '/dashboard' });
  }

  editChampionship(id: number): void {
    this.router.navigate(['/campeonato/edit', id]);
  }

  viewDetails(id: number): void {
    this.router.navigate(['/campeonato/details', id]);
  }

  deleteChampionship(id: number): void {
    if (confirm('¿Estás seguro de que quieres eliminar este campeonato?')) {
      // TODO: Conectar con API para eliminar
      this.championships = this.championships.filter(c => c.id !== id);
      this.onSearchChange();
    }
  }
}
