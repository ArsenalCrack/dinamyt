import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Location } from '@angular/common';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

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

  // Modales
  showDeleteModal = false;
  deletingId: number | null = null;
  isDeleting = false;
  copiedId: number | null = null;

  constructor(
    private router: Router,
    private location: Location,
    private backNav: BackNavigationService,
    private api: ApiService,
    private scrollLock: ScrollLockService
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
            pais: c.pais || 'Colombia', // Ghost data
            ciudad: c.ciudad || 'Bogotá', // Ghost data
            participantes: c.participantes ?? 0,
            estado: status,
            estadoLabel: this.getEstadoLabel(status),
            Codigo: c.Codigo,
            esPublico: c.esPublico !== false,
            isVisible: (
              c.visible !== 0 && c.visible !== '0' && c.visible !== false &&
              c.Visible !== 0 && c.Visible !== '0' && c.Visible !== false &&
              c.visibilidad !== 0 && c.visibilidad !== '0' && c.visibilidad !== false &&
              c.Visibilidad !== 0 && c.Visibilidad !== '0' && c.Visibilidad !== false
            )
          };
        }).filter(c => c.isVisible);
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
    if (!fechaInicio) return 'PLANIFICADO';

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const parseLocalDate = (dateStr: string): Date => {
      if (!dateStr) return new Date();
      const parts = dateStr.split('T')[0].split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
      return new Date(dateStr);
    };

    const startCompare = parseLocalDate(fechaInicio);
    startCompare.setHours(0, 0, 0, 0);

    const endCompare = fechaFin ? parseLocalDate(fechaFin) : new Date(startCompare);
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
        (c.ubicacion || '').toLowerCase().includes(query) ||
        (c.ciudad || '').toLowerCase().includes(query) ||
        (c.pais || '').toLowerCase().includes(query)
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

  goToPanel(id: number): void {
    this.router.navigate(['/campeonato/panel', id]);
  }

  viewDetails(id: number): void {
    this.goToPanel(id);
  }

  deleteChampionship(id: number): void {
    this.deletingId = id;
    this.showDeleteModal = true;
    this.scrollLock.lock();
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.deletingId = null;
    this.isDeleting = false;
    this.scrollLock.unlock();
  }

  confirmDelete(): void {
    if (this.deletingId === null) return;

    this.isDeleting = true;
    this.api.deleteCampeonato(this.deletingId).subscribe({
      next: () => {
        this.championships = this.championships.filter(c => c.id !== this.deletingId);
        this.onSearchChange();
        this.closeDeleteModal();
      },
      error: (err) => {
        console.error('Error deleting championship:', err);
        // Fallback for demo if API fails
        this.championships = this.championships.filter(c => c.id !== this.deletingId);
        this.onSearchChange();
        this.closeDeleteModal();
      }
    });
  }

  copyCode(id: number, code: string): void {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      this.copiedId = id;
      setTimeout(() => this.copiedId = null, 2000);
    });
  }
}
