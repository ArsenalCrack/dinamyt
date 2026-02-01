import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common'; // Import Location
import { delay } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { ApiService } from '../../../core/services/api.service';

interface Inscripcion {
  id: number;
  nombre: string;
  edad: number;
  sexo: string;
  peso: string;
  documentoId: string;
  academia: string;
  nacionalidad: string;
  cinturon: string;
  instructor: string;
  correo: string;
  telefono: string;
  ciudad: string; // New field
  modalidades: string[]; // New field
  estado: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO';
  expanded?: boolean; // UI state
}

import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-championship-inscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
  templateUrl: './championship-inscriptions.component.html',
  styleUrls: ['./championship-inscriptions.component.scss']
})
export class ChampionshipInscriptionsComponent implements OnInit {
  championshipId: string | null = null;
  searchQuery: string = '';

  activeTab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' = 'PENDIENTE';

  // Mock Data
  inscriptions: Inscripcion[] = [
    {
      id: 1,
      nombre: 'Carlos Rodríguez',
      edad: 24,
      sexo: 'Masculino',
      peso: '70kg',
      documentoId: '1090223344',
      academia: 'Gracie Barra',
      nacionalidad: 'Colombiana',
      ciudad: 'Bogotá',
      modalidades: ['Combates', 'Figura con armas'],
      cinturon: 'Azul',
      instructor: 'Mestre Silva',
      correo: 'carlos.rod@email.com',
      telefono: '+57 300 123 4567',
      estado: 'PENDIENTE'
    },
    {
      id: 2,
      nombre: 'Ana María López',
      edad: 22,
      sexo: 'Femenino',
      peso: '58kg',
      documentoId: '1098776655',
      academia: 'Alliance',
      nacionalidad: 'Colombiana',
      ciudad: 'Medellín',
      modalidades: ['Defensa personal'],
      cinturon: 'Blanco',
      instructor: 'Coach Pedro',
      correo: 'ana.lopez@email.com',
      telefono: '+57 310 987 6543',
      estado: 'ACEPTADO'
    },
    {
      id: 3,
      nombre: 'Juan Pablo Perez',
      edad: 28,
      sexo: 'Masculino',
      peso: '82kg',
      documentoId: '1055887744',
      academia: 'Checkmat',
      nacionalidad: 'Venezolana',
      ciudad: 'Caracas',
      modalidades: ['Combates', 'Salto alto'],
      cinturon: 'Morado',
      instructor: 'Profesor X',
      correo: 'juan.perez@email.com',
      telefono: '+57 320 111 2233',
      estado: 'RECHAZADO'
    },
    {
      id: 4,
      nombre: 'Luisa Fernanda',
      edad: 19,
      sexo: 'Femenino',
      peso: '50kg',
      documentoId: '1022334455',
      academia: 'Unity',
      nacionalidad: 'Colombiana',
      ciudad: 'Cali',
      modalidades: ['Kata'],
      cinturon: 'Azul',
      instructor: 'Sensei Ryu',
      correo: 'luisa.fer@email.com',
      telefono: '+57 315 555 6677',
      estado: 'PENDIENTE'
    },
    {
      id: 5,
      nombre: 'Pedro Pascal',
      edad: 35,
      sexo: 'Masculino',
      peso: '75kg',
      documentoId: '1011223344',
      academia: 'Beskar Gym',
      nacionalidad: 'Chilena',
      ciudad: 'Santiago',
      modalidades: ['Combates'],
      cinturon: 'Negro',
      instructor: 'Mando',
      correo: 'pedro.p@email.com',
      telefono: '+56 9 1234 5678',
      estado: 'ACEPTADO'
    }
  ];

  filteredInscriptions: Inscripcion[] = [];

  // Logic states
  rejectModalOpen = false;
  loading = false; // Added loading state
  rejectTargetId: number | null = null;

  deleteModalOpen = false;
  deleteTargetId: number | null = null;

  toastVisible = false;
  toastMessage = '';

  // Pagination
  currentPage: number = 1;
  itemsPerPage: number = 5;
  totalPages: number = 1;
  paginatedInscriptions: Inscripcion[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private backNav: BackNavigationService,
    private scrollLock: ScrollLockService,
    private location: Location,
    private api: ApiService
  ) { }

  ngOnInit(): void {
    this.championshipId = this.route.snapshot.paramMap.get('id');
    if (this.championshipId) {
      this.loadInscriptions();
    } else {
      this.applyFilters();
    }
  }

  loadInscriptions(): void {
    if (!this.championshipId) return;
    this.loading = true;
    this.scrollLock.lock();

    this.api.getInscriptionsByChampionship(this.championshipId)
      .pipe(delay(1000))
      .subscribe({
        next: (data) => {
          if (data && Array.isArray(data)) {
            this.inscriptions = data.map((item: any) => ({
              id: item.id || item.id_inscripcion,
              nombre: item.nombre_usuario || item.nombre_completo || item.nombre || 'Desconocido',
              edad: item.edad || 0,
              sexo: item.sexo || 'N/A',
              peso: item.peso || '0kg',
              documentoId: item.documento || item.documentoId || 'Sin Doc',
              academia: item.academia || 'Independiente',
              nacionalidad: item.nacionalidad || 'Colombia',
              ciudad: item.ciudad || 'Bogotá',
              modalidades: item.modalidades || [],
              cinturon: item.cinturon || 'Blanco',
              instructor: item.instructor || 'Indefinido',
              correo: item.correo || '',
              telefono: item.telefono || '',
              estado: item.estado || 'PENDIENTE',
              expanded: false
            }));
            this.applyFilters();
          }
          this.loading = false;
          this.scrollLock.unlock();
        },
        error: (err) => {
          console.warn('API de inscripciones no disponible, usando mocks.', err);
          // Keep mocks
          this.loading = false;
          this.scrollLock.unlock();
          this.applyFilters();
        }
      });
  }

  setActiveTab(tab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO'): void {
    this.activeTab = tab;
    this.applyFilters();
  }

  goBack(): void {
    // Navigate back to details
    this.location.back();
  }

  toggleDetails(id: number): void {
    const item = this.inscriptions.find(i => i.id === id);
    if (item) {
      item.expanded = !item.expanded;
    }
  }

  applyFilters(): void {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredInscriptions = this.inscriptions.filter(i => {
      // Filter by tab status
      const matchesTab = i.estado === this.activeTab;
      // Filter by search
      const matchesSearch = (i.nombre.toLowerCase().includes(q) || i.documentoId.includes(q));

      return matchesTab && matchesSearch;
    });

    // Reset pagination
    this.currentPage = 1;
    this.updatePagination();
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredInscriptions.length / this.itemsPerPage) || 1;
    if (this.currentPage > this.totalPages) this.currentPage = 1;

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedInscriptions = this.filteredInscriptions.slice(startIndex, endIndex);
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
      this.scrollToTop();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    const element = document.getElementById('inscriptions-search-anchor');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  acceptInscription(inscription: Inscripcion): void {
    // Mock logic
    inscription.estado = 'ACEPTADO';
    this.showToast(`El competidor ${inscription.nombre} ha sido aceptado con éxito.`);
    this.applyFilters(); // Re-run filters to remove from pending view
  }

  confirmReject(id: number): void {
    this.rejectTargetId = id;
    this.rejectModalOpen = true;
    this.scrollLock.lock();
  }

  closeRejectModal(): void {
    this.rejectModalOpen = false;
    this.rejectTargetId = null;
    this.scrollLock.unlock();
  }

  finalizeReject(): void {
    if (this.rejectTargetId) {
      const item = this.inscriptions.find(i => i.id === this.rejectTargetId);
      if (item) {
        item.estado = 'RECHAZADO';
        this.showToast(`La inscripción de ${item.nombre} ha sido rechazada.`);
        this.applyFilters();
      }
    }
    this.closeRejectModal();
  }

  // Delete / Remove functionality for Accepted
  confirmDelete(id: number): void {
    this.deleteTargetId = id;
    this.deleteModalOpen = true;
    this.scrollLock.lock();
  }

  closeDeleteModal(): void {
    this.deleteModalOpen = false;
    this.deleteTargetId = null;
    this.scrollLock.unlock();
  }

  finalizeDelete(): void {
    if (this.deleteTargetId) {
      // For mock purposes, we'll remove it from the list completely 
      // OR set it back to rejected? User said "eliminar".
      // Let's remove it from array for now.
      this.inscriptions = this.inscriptions.filter(i => i.id !== this.deleteTargetId);
      this.showToast('El competidor ha sido eliminado del campeonato.');
      this.applyFilters();
    }
    this.closeDeleteModal();
  }

  showToast(msg: string): void {
    this.toastMessage = msg;
    this.toastVisible = true;
    setTimeout(() => {
      this.toastVisible = false;
    }, 3000);
  }
}
