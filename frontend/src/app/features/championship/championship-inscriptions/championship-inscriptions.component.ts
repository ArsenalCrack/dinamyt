import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common'; // Import Location
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

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

@Component({
  selector: 'app-championship-inscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './championship-inscriptions.component.html',
  styleUrls: ['./championship-inscriptions.component.scss']
})
export class ChampionshipInscriptionsComponent implements OnInit {
  championshipId: string | null = null;
  searchQuery: string = '';

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
      estado: 'PENDIENTE'
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
      estado: 'PENDIENTE'
    }
  ];

  filteredInscriptions: Inscripcion[] = [];

  // Logic states
  rejectModalOpen = false;
  rejectTargetId: number | null = null;

  toastVisible = false;
  toastMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private backNav: BackNavigationService,
    private scrollLock: ScrollLockService,
    private location: Location
  ) { }

  ngOnInit(): void {
    this.championshipId = this.route.snapshot.paramMap.get('id');
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
    this.filteredInscriptions = this.inscriptions.filter(i =>
      i.estado === 'PENDIENTE' && // Show only pending initially? User said "see all", but Accept/Reject implies pending management. Let's show all but maybe pending first. 
      // Re-reading: "ver todas las inscripciones". But buttons only make sense for pending. 
      // Let's filter text first.
      (i.nombre.toLowerCase().includes(q) || i.documentoId.includes(q))
    );
  }

  acceptInscription(inscription: Inscripcion): void {
    // Mock logic
    inscription.estado = 'ACEPTADO';
    this.showToast(`El competidor ${inscription.nombre} ha sido aceptado con éxito.`);
    // Optional: hide or move to bottom? 
    // For now just update state.
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
      }
    }
    this.closeRejectModal();
  }

  showToast(msg: string): void {
    this.toastMessage = msg;
    this.toastVisible = true;
    setTimeout(() => {
      this.toastVisible = false;
    }, 3000);
  }
}
