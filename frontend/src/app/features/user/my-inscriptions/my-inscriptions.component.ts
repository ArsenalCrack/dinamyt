import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';

@Component({
  selector: 'app-my-inscriptions',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingSpinnerComponent],
  templateUrl: './my-inscriptions.component.html',
  styleUrl: './my-inscriptions.component.scss'
})
export class MyInscriptionsComponent implements OnInit {
  activeTab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' = 'PENDIENTE';
  loading = true;
  inscriptions: any[] = [];
  filteredInscriptions: any[] = [];

  showDeleteModal = false;
  selectedInscriptionId: number | null = null;
  deleting = false;

  constructor(
    private api: ApiService,
    private backNav: BackNavigationService,
    private location: Location
  ) { }

  ngOnInit(): void {
    this.loadInscriptions();
  }

  loadInscriptions(): void {
    const userId = sessionStorage.getItem('ID_documento'); // Use correct session key
    if (!userId) {
      this.loading = false;
      return;
    }

    this.loading = true;
    this.api.getMisInscripciones(userId).subscribe({
      next: (data) => {
        this.inscriptions = data || [];
        this.applyFilter();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error fetching inscriptions', err);
        this.inscriptions = [];
        this.applyFilter();
        this.loading = false;
      }
    });
  }

  setTab(tab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO'): void {
    this.activeTab = tab;
    this.applyFilter();
  }

  applyFilter(): void {
    this.filteredInscriptions = this.inscriptions.filter(i => i.estado === this.activeTab);
  }

  goBack(): void {
    this.location.back();
  }

  requestDelete(id: number): void {
    this.selectedInscriptionId = id;
    this.showDeleteModal = true;
  }

  cancelDelete(): void {
    this.showDeleteModal = false;
    this.selectedInscriptionId = null;
  }

  confirmDelete(): void {
    if (!this.selectedInscriptionId) return;

    this.deleting = true;
    this.api.eliminarInscripcion(this.selectedInscriptionId).subscribe({
      next: () => {
        this.inscriptions = this.inscriptions.filter(i => i.id !== this.selectedInscriptionId);
        this.applyFilter();
        this.deleting = false;
        this.showDeleteModal = false;
        this.selectedInscriptionId = null;
      },
      error: (err) => {
        console.error('Error deleting inscription', err);
        this.deleting = false;
        alert('Error al eliminar la inscripción.');
      }
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'ACEPTADO': return 'status-accepted';
      case 'RECHAZADO': return 'status-rejected';
      default: return 'status-pending';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'ACEPTADO': return 'Aceptada';
      case 'RECHAZADO': return 'Rechazada';
      case 'PENDIENTE': return 'Pendiente';
      default: return status;
    }
  }
}
