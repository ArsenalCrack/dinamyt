
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { interval, Subscription } from 'rxjs';

@Component({
    selector: 'app-judge-panel',
    standalone: true,
    imports: [CommonModule, LoadingSpinnerComponent, FormsModule],
    templateUrl: './judge-panel.component.html',
    styleUrls: ['./judge-panel.component.scss']
})
export class JudgePanelComponent implements OnInit, OnDestroy {
    idCampeonato: string | null = null;
    cargando = true;
    mensajeError: string | null = null;

    // Estado
    tatamiAsignado: any = null;
    seccionActual: any = null;
    rol: string = 'Referi de Esquina'; // Puede ser 'Central', 'Mesa', 'Esquina'

    // Estado de la modalidad
    modo: 'COMBATE' | 'PUNTUACION' = 'COMBATE';

    // Puntuación / Combate (1 vs 1)
    competidorRojo: any = null;
    competidorAzul: any = null;
    puntuaciones: { rojo: number, azul: number } = { rojo: 0, azul: 0 };

    // Puntuación / Exhibición (Lista de Competidores)
    competidores: any[] = [];
    competidorActualId: string | null = null;

    suscripcionPolling: Subscription | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private api: ApiService
    ) { }

    ngOnInit(): void {
        this.idCampeonato = this.route.snapshot.paramMap.get('id');
        if (!this.idCampeonato) {
            this.mensajeError = 'Campeonato no válido';
            this.cargando = false;
            return;
        }

        this.verificarAsignacion();
    }

    ngOnDestroy(): void {
        if (this.suscripcionPolling) {
            this.suscripcionPolling.unsubscribe();
        }
    }

    verificarAsignacion() {
        this.cargando = true;
        const userId = sessionStorage.getItem('idDocumento');

        if (!userId || !this.idCampeonato) {
            this.mensajeError = 'No se pudo identificar al usuario o campeonato.';
            this.cargando = false;
            return;
        }

        this.api.getJudgeAssignment(this.idCampeonato, userId).subscribe({
            next: (data) => {
                this.cargando = false;
                if (data) {
                    this.tatamiAsignado = { id: data.tatamiId, nombre: data.nombre };
                    this.rol = data.rol || 'Referi de Esquina';

                    // Iniciar polling una vez confirmada la asignación
                    this.actualizarEstado(); // Primer llamada inmediata
                    this.suscripcionPolling = interval(3000).subscribe(() => {
                        this.actualizarEstado();
                    });
                } else {
                    this.mensajeError = 'No tienes asignación activa en este momento.';
                }
            },
            error: (e) => {
                console.error('Error verificando asignación:', e);
                this.cargando = false;
                this.mensajeError = 'Error al verificar asignación de juez.';
            }
        });
    }

    actualizarEstado() {
        if (!this.tatamiAsignado || !this.idCampeonato) return;

        this.api.getCurrentMatch(this.idCampeonato, this.tatamiAsignado.id).subscribe({
            next: (match) => {
                if (match) {
                    // Detectar modo
                    const nuevoModo = (match.tipo === 'PUNTUACION' || match.competidores) ? 'PUNTUACION' : 'COMBATE';
                    this.modo = nuevoModo;

                    // Si el combate/grupo cambió, reseteamos o actualizamos
                    if (!this.seccionActual || this.seccionActual.matchId !== match.matchId) {
                        this.seccionActual = {
                            matchId: match.matchId,
                            id: match.sectionId, // Puede venir undefined si es grupo
                            nombre: match.nombreCategoria || match.categoria || 'Categoría',
                            categoria: match.categoria || '',
                            estado: match.estado
                        };

                        if (this.modo === 'COMBATE') {
                            this.competidorRojo = match.competidorRojo;
                            this.competidorAzul = match.competidorAzul;
                            this.puntuaciones = {
                                rojo: match.puntuacionRojo || 0,
                                azul: match.puntuacionAzul || 0
                            };
                            this.competidores = [];
                        } else {
                            // MODO PUNTUACION
                            this.competidores = match.competidores || [];
                            this.competidorActualId = match.competidorActualId || null;
                            this.competidorRojo = null;
                            this.competidorAzul = null;
                        }

                    } else {
                        // Actualización de estado en caliente (mismo match/grupo)
                        this.seccionActual.estado = match.estado;

                        if (this.modo === 'COMBATE') {
                            this.puntuaciones.rojo = match.puntuacionRojo || 0;
                            this.puntuaciones.azul = match.puntuacionAzul || 0;
                        } else {
                            // Actualizar puntaje de la lista si cambia algo en tiempo real
                            if (match.competidores) {
                                this.competidores = match.competidores;
                            }
                            this.competidorActualId = match.competidorActualId;
                        }
                    }
                } else {
                    // No hay actividad activa
                    this.seccionActual = null;
                    this.competidorRojo = null;
                    this.competidorAzul = null;
                    this.competidores = [];
                }
            },
            error: (e) => console.error('Error polling match:', e)
        });
    }

    agregarPunto(color: 'rojo' | 'azul', puntos: number) {
        if (!this.seccionActual || this.modo !== 'COMBATE') return;

        // Optimistic UI update
        if (color === 'rojo') this.puntuaciones.rojo += puntos;
        else this.puntuaciones.azul += puntos;

        if (this.seccionActual && this.idCampeonato) {
            this.api.updateMatchScore(this.idCampeonato, this.seccionActual.matchId, this.puntuaciones).subscribe({
                next: () => { }, // Success
                error: (e) => {
                    console.error('Error actualizando puntaje', e);
                    // Rollback on error could be implemented here
                }
            });
        }
    }

    // Nuevo método para calificar competidor individualmente (Figuras/Defensa)
    calificarCompetidor(competitorId: string, puntaje: number) {
        if (!this.seccionActual || this.modo !== 'PUNTUACION') return;

        // Aquí se enviaría el puntaje individual al backend
        // Como no tenemos el endpoint específico definido aún en el service, usamos un genérico o el mismo de score adaptado
        // Por ahora, simulamos el envío con updateMatchScore pero adaptando el payload o creamos uno nuevo en service.

        // TODO: Implementar endpoint específico en backend: /competitors/{id}/score
        console.log(`Calificando competidor ${competitorId} con ${puntaje}`);

        // Optimistic Update local
        const comp = this.competidores.find(c => c.id === competitorId);
        if (comp) comp.puntaje = puntaje;
    }

    volverAtras() {
        this.router.navigate(['/dashboard']);
    }
}
