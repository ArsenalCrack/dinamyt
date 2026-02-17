
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { NavigationHistoryService } from '../../../core/services/navigation-history.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

@Component({
    selector: 'app-championship-panel',
    standalone: true,
    imports: [CommonModule, RouterModule, LoadingSpinnerComponent],
    templateUrl: './championship-panel.component.html',
    styleUrls: ['./championship-panel.component.scss']
})
export class ChampionshipPanelComponent implements OnInit, OnDestroy {
    id: string | null = null;
    campeonato: any = null;
    cargando = true;
    mensajeError: string | null = null;
    currentUserId: string | null = null;
    copiado = false;

    // Estados de modales
    mostrarModalEliminar = false;
    mostrarModalPublicar = false;
    mostrarModalEdicionBloqueada = false;
    eliminando = false;
    publicando = false;

    constructor(
        private route: ActivatedRoute,
        private api: ApiService,
        private router: Router,
        private backNav: BackNavigationService,
        private navHistory: NavigationHistoryService,
        private scrollLock: ScrollLockService
    ) { }

    ngOnInit(): void {
        this.currentUserId = sessionStorage.getItem('idDocumento');
        this.id = this.route.snapshot.paramMap.get('id');

        if (this.id) {
            this.loadData();
        } else {
            this.mensajeError = 'ID de campeonato no válido.';
            this.cargando = false;
        }
    }

    loadData(): void {
        this.cargando = true;
        this.api.getCampeonatoById(this.id!).subscribe({
            next: (data) => {
                this.campeonato = data;

                // Security Check: Visibility (Deleted/Hidden)
                const isVisible = (
                    data.visible !== 0 && data.visible !== '0' && data.visible !== false &&
                    data.Visible !== 0 && data.Visible !== '0' && data.Visible !== false &&
                    data.visibilidad !== 0 && data.visibilidad !== '0' && data.visibilidad !== false &&
                    data.Visibilidad !== 0 && data.Visibilidad !== '0' && data.Visibilidad !== false
                );

                if (!isVisible) {
                    this.router.navigate(['/mis-campeonatos']);
                    return;
                }

                // Validar propiedad del campeonato
                if (!this.isOwner()) {
                    this.router.navigate(['/mis-campeonatos']); // Redirigir si no es dueño
                    return;
                }

                // Calcular estado
                if (!this.campeonato.pais) this.campeonato.pais = 'Colombia';
                if (!this.campeonato.ciudad) this.campeonato.ciudad = 'Bogotá';
                this.campeonato.estadoReal = this.calculateStatus(this.campeonato.fechaInicio, this.campeonato.fecha_fin);

                this.cargando = false;
            },
            error: (err) => {
                console.error('Error loading championship panel:', err);
                this.mensajeError = 'No se pudo cargar la información del campeonato.';
                this.cargando = false;
            }
        });
    }

    calculateStatus(fechaInicio: string, fechaFin: string | undefined): string {
        if (!fechaInicio) return 'PLANIFICADO';

        // Prioridad: Estado explícito > Privacidad (Borrador) > Lógica de fechas
        if (this.campeonato?.estado === 'BORRADOR') return 'BORRADOR';
        if (this.campeonato?.estado === 'LISTO') return 'LISTO';

        // Si no es público (y no es LISTO/BORRADOR), es un Borrador
        // Verificar igualdad flexible o booleana
        const isPublic = this.campeonato?.esPublico === true || this.campeonato?.esPublico === 1 || this.campeonato?.esPublico === '1';
        if (!isPublic) return 'BORRADOR';

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

    volverAtras(): void {
        this.router.navigate(['/mis-campeonatos']);
    }

    copiarCodigo(): void {
        const codeToCopy = this.campeonato?.Codigo || this.campeonato?.codigo;
        if (!codeToCopy) return;

        navigator.clipboard.writeText(codeToCopy).then(() => {
            this.copiado = true;
            setTimeout(() => this.copiado = false, 2000);
        });
    }

    // Métodos de acción
    iniciarCampeonato(): void {
        this.router.navigate(['/campeonato/live', this.id]);
    }

    enviarInvitaciones(): void {
        this.router.navigate(['/campeonato/invitations', this.id]);
    }

    verInscripciones(): void {
        this.router.navigate(['/campeonato/inscriptions', this.id]);
    }

    editarCampeonato(): void {
        if (this.campeonato.estado === 'LISTO') {
            this.mostrarModalEdicionBloqueada = true;
            this.scrollLock.lock();
            return;
        }
        this.router.navigate(['/campeonato/edit', this.id]);
    }

    cerrarModalEdicionBloqueada(): void {
        this.mostrarModalEdicionBloqueada = false;
        this.scrollLock.unlock();
    }

    publicarCampeonato(): void {
        if (!this.id || this.publicando) return;
        this.mostrarModalPublicar = true;
        this.scrollLock.lock();
    }

    cerrarModalPublicar(): void {
        this.mostrarModalPublicar = false;
        this.publicando = false;
        this.scrollLock.unlock();
    }

    confirmarPublicacion(): void {
        this.publicando = true;
        const payload = {
            ...this.campeonato,
            estado: 'LISTO',
            esPublico: 1,
            visible: 1,
            modalidades: typeof this.campeonato.modalidades === 'string'
                ? JSON.parse(this.campeonato.modalidades)
                : this.campeonato.modalidades
        };

        this.api.updateCampeonato(this.id!, payload).subscribe({
            next: (updatedData) => {
                this.cerrarModalPublicar();
                this.campeonato.estado = 'LISTO';
                this.campeonato.esPublico = 1;
                this.campeonato.visible = 1;
                this.campeonato.estadoReal = 'LISTO';
            },
            error: (err) => {
                console.error('Error al publicar campeonato:', err);
                this.publicando = false;
                alert('Hubo un error al publicar el campeonato. Por favor intenta de nuevo.');
            }
        });
    }

    verDetallesPublicos(): void {
        this.router.navigate(['/campeonato/details', this.id]);
    }

    // Lógica de eliminación
    eliminarCampeonato(): void {
        this.mostrarModalEliminar = true;
        this.scrollLock.lock();
    }

    cerrarModalEliminar(): void {
        this.mostrarModalEliminar = false;
        this.eliminando = false;
        this.scrollLock.unlock();
    }

    confirmarEliminar(): void {
        if (!this.id) return;
        this.eliminando = true;
        this.api.deleteCampeonato(this.id).subscribe({
            next: () => {
                this.cerrarModalEliminar();
                this.navHistory.removeLastUrl();
                this.router.navigate(['/mis-campeonatos']);
            },
            error: (err) => {
                console.error('Error al eliminar:', err);
                this.eliminando = false;
                this.cerrarModalEliminar();
                this.navHistory.removeLastUrl();
                this.router.navigate(['/mis-campeonatos']);
            }
        });
    }

    ngOnDestroy(): void {
        this.scrollLock.unlock();
    }
}
