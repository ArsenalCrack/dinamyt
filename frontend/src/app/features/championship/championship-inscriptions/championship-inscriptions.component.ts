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
  edad: number | null; // Allow null for age
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
  fecha: string; // New field
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

  inscriptions: Inscripcion[] = [];

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
  calcularEdad(fechaNacimiento: string): number | null {
    if (!fechaNacimiento) return null;
    const birthDate = new Date(fechaNacimiento);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
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
            this.inscriptions = data.map((item: any) => {
              // Extract modalities (secciones)
              const mods: string[] = item.secciones || [];

              // Extract Weight
              let weight = 'N/A';
              const weightMod = mods.find(s => s.toLowerCase().includes('peso'));
              if (weightMod) {
                if (weightMod.includes('SIN_PESO')) {
                  weight = 'SIN_PESO';
                } else {
                  // Extract value after "Peso:" if possible, or keep the string
                  // Example: "Categoria X - Peso: 70kg"
                  const match = weightMod.match(/Peso:\s*([^,]+)/);
                  if (match) weight = match[1].trim();
                  else weight = weightMod; // Fallback
                }
              }

              return {
                id: item.idincripcion, // Use idincripcion not idDocumento for actions
                nombre: item.nombreC || 'Desconocido',
                sexo: item.sexo || 'N/A',
                documentoId: item.idDocumento || 'Sin Doc',
                nacionalidad: item.nacionalidad || 'Colombia',
                ciudad: item.ciudad || 'No definida',
                cinturon: item.cinturonRango || 'Blanco',
                correo: item.correo || '',
                telefono: item.numeroCelular || '',
                edad: item.fechaNacimiento ? this.calcularEdad(item.fechaNacimiento) : null,
                fecha: item.fechaInscripcion || new Date().toISOString(), // Add date mapping

                estado: (() => {
                  // item.estado might be boolean (true/false) in DTO? 
                  // DTO says "private Integer estado;" but "dto.setEstado(ins.isEstado());" which is Integer?
                  // Let's assume it is number: 2=Pend, 3=Acc, 4=Rej
                  if (item.estado === 2) return 'PENDIENTE';
                  if (item.estado === 3) return 'ACEPTADO';
                  if (item.estado === 4) return 'RECHAZADO';
                  // Boolean fallback?
                  if (item.estado === true) return 'ACEPTADO';
                  if (item.estado === false) return 'PENDIENTE';
                  return 'PENDIENTE';
                })(),

                peso: weight,
                academia: item.academia || 'Independiente',
                modalidades: mods,
                instructor: item.instructor || 'Indefinido',
                expanded: false,
                // store original id if needed
                idinscripcion: item.idincripcion
              };
            });

            this.applyFilters();
          }
          this.loading = false;
          this.scrollLock.unlock();
        },
        error: (err) => {
          console.warn('Error cargando inscripciones:', err);
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
      const matchesTab = i.estado === this.activeTab;
      const matchesSearch = (i.nombre.toLowerCase().includes(q) || String(i.documentoId).includes(q));
      return matchesTab && matchesSearch;
    });

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
    this.loading = true;
    // Assuming backend endpoint /inscripciones/{id}/aceptar OR PUT /inscripciones/{id} exists or we use invitation responder?
    // User said "work for real". The only endpoint enabling "visible=true" changes is NOT sufficient for state change 2->3.
    // However, I will use api.updateInscripcionState(id, 3) which I'll ensure exists in service.
    this.api.gestionarInscripcionCampeonato(inscription.id, 3).subscribe({
      next: () => {
        inscription.estado = 'ACEPTADO';
        this.showToast(`El competidor ${inscription.nombre} ha sido aceptado con éxito.`);
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.showToast('Error al aceptar inscripción');
        this.loading = false;
      }
    });
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
      this.loading = true;
      // Use updateInscriptionState(4) for REJECT status
      this.api.gestionarInscripcionCampeonato(this.rejectTargetId, 4).subscribe({
        next: () => {
          this.showToast(`Inscripción rechazada.`);
          // Reload from server to ensure fresh state and clear update
          this.loadInscriptions();
          // Modal closing and loading=false is handled by loadInscriptions logic or we reset here?
          // loadInscriptions sets loading=true then false.
          // But we need to close modal now.
        },
        error: (err) => {
          console.error(err);
          this.showToast('Error al rechazar inscripción');
          this.loading = false;
        }
      });
    }
    this.closeRejectModal();
  }

  cleanModality(mod: string): string {
    // Remove "- Peso: SIN_PESOkg" and variations
    // Also remove "- Edad: NULL" or "Edad: NULL"
    let cleaned = mod.replace(/-\s*Peso:\s*SIN_PESO\s*kg/gi, '')
      .replace(/Peso:\s*SIN_PESO\s*kg/gi, '')
      .replace(/-\s*Peso:\s*SIN_PESO/gi, '')
      .replace(/-\s*Edad:\s*NULL/gi, '')
      .replace(/Edad:\s*NULL\s*-\s*/gi, '') // If it's in the middle or start with a dash after
      .replace(/Edad:\s*NULL/gi, '');

    // Cleanup potential double dashes or trailing dashes
    cleaned = cleaned.replace(/\s*-\s*-\s*/g, ' - ').replace(/\s*-\s*$/, '').trim();

    return cleaned;
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
      this.loading = true;
      // User requested that "Eliminar" also sets state to 4 (Rejected)
      this.api.gestionarInscripcionCampeonato(this.deleteTargetId, 4).subscribe({
        next: () => {
          this.showToast('Competidor eliminado (enviado a rechazados).');
          this.loadInscriptions();
          // Modal close handled below, loading handled by loadInscriptions
        },
        error: (err) => {
          console.error(err);
          this.showToast('Error al eliminar');
          this.loading = false;
        }
      });
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
