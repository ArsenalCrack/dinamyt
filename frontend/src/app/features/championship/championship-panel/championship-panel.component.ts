
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

@Component({
    selector: 'app-championship-panel',
    standalone: true,
    imports: [CommonModule, RouterModule, LoadingSpinnerComponent],
    templateUrl: './championship-panel.component.html',
    styleUrls: ['./championship-panel.component.scss']
})
export class ChampionshipPanelComponent implements OnInit {
    id: string | null = null;
    campeonato: any = null;
    loading = true;
    error: string | null = null;
    currentUserId: string | null = null;
    copied = false;

    // Modal states
    showDeleteModal = false;
    isDeleting = false;

    constructor(
        private route: ActivatedRoute,
        private api: ApiService,
        private router: Router,
        private backNav: BackNavigationService,
        private scrollLock: ScrollLockService
    ) { }

    ngOnInit(): void {
        this.currentUserId = sessionStorage.getItem('idDocumento');
        this.id = this.route.snapshot.paramMap.get('id');

        if (this.id) {
            this.loadData();
        } else {
            this.error = 'ID de campeonato no válido.';
            this.loading = false;
        }
    }

    loadData(): void {
        this.loading = true;
        this.api.getCampeonatoById(this.id!).subscribe({
            next: (data) => {
                this.campeonato = data;

                // Validate Ownership
                if (!this.isOwner()) {
                    this.router.navigate(['/mis-campeonatos']); // Redirect if not owner
                    return;
                }

                // Calculate status
                if (!this.campeonato.pais) this.campeonato.pais = 'Colombia'; // Ghost
                if (!this.campeonato.ciudad) this.campeonato.ciudad = 'Bogotá'; // Ghost
                this.campeonato.estadoReal = this.calculateStatus(this.campeonato.fechaInicio, this.campeonato.fecha_fin);

                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading championship panel:', err);
                this.error = 'No se pudo cargar la información del campeonato.';
                this.loading = false;
            }
        });
    }

    calculateStatus(fechaInicio: string, fechaFin: string | undefined): string {
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

    isOwner(): boolean {
        if (!this.campeonato || !this.currentUserId) return false;
        return String(this.campeonato.creadoPor) === String(this.currentUserId);
    }

    goBack(): void {
        this.router.navigate(['/mis-campeonatos']);
    }

    copyCode(): void {
        const codeToCopy = this.campeonato?.Codigo || this.campeonato?.codigo;
        if (!codeToCopy) return;

        navigator.clipboard.writeText(codeToCopy).then(() => {
            this.copied = true;
            setTimeout(() => this.copied = false, 2000);
        });
    }

    // Action Methods
    startChampionship(): void {
        if (confirm('¿Estás seguro de iniciar el campeonato? Esto cambiará el estado a EN CURSO.')) {
            // Here you would call the API to update status, for now just ui update
            this.campeonato.estadoReal = 'ACTIVO'; // Or whatever logic implies running
        }
    }

    sendInvitations(): void {
        this.router.navigate(['/campeonato/invitations', this.id]);
    }

    viewInscriptions(): void {
        this.router.navigate(['/campeonato/inscriptions', this.id]);
    }

    editChampionship(): void {
        this.router.navigate(['/campeonato/edit', this.id]);
    }

    viewPublicDetails(): void {
        this.router.navigate(['/campeonato/details', this.id]);
    }

    // Delete Logic
    deleteChampionship(): void {
        this.showDeleteModal = true;
        this.scrollLock.lock();
    }

    closeDeleteModal(): void {
        this.showDeleteModal = false;
        this.isDeleting = false;
        this.scrollLock.unlock();
    }

    confirmDelete(): void {
        if (!this.id) return;
        this.isDeleting = true;
        this.api.deleteCampeonato(this.id).subscribe({
            next: () => {
                this.closeDeleteModal();
                this.router.navigate(['/mis-campeonatos']);
            },
            error: (err) => {
                console.error('Error deleting:', err);
                this.isDeleting = false;
                // Fallback
                this.router.navigate(['/mis-campeonatos']);
            }
        });
    }
}
