
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { interval, Subscription } from 'rxjs';

@Component({
    selector: 'app-judge-panel',
    standalone: true,
    imports: [CommonModule, LoadingSpinnerComponent],
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
    rol: string = 'Juez'; // Puede ser 'Central', 'Mesa', 'Esquina'

    // Puntuación / Combate
    competidorRojo: any = null;
    competidorAzul: any = null;
    puntuaciones: { rojo: number, azul: number } = { rojo: 0, azul: 0 };

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

        // Consultar actualizaciones cada 5 segundos
        this.suscripcionPolling = interval(5000).subscribe(() => {
            this.actualizarEstado();
        });
    }

    ngOnDestroy(): void {
        if (this.suscripcionPolling) {
            this.suscripcionPolling.unsubscribe();
        }
    }

    verificarAsignacion() {
        this.cargando = true;
        // TODO: Llamar al backend para obtener el estado del juez
        // this.api.getJudgeAssignment(this.idCampeonato).subscribe(...)

        // Simulación de datos
        setTimeout(() => {
            this.cargando = false;
            this.tatamiAsignado = { id: 1, nombre: 'Tatami 1' };
            this.rol = 'Juez Central';

            this.seccionActual = {
                id: 'sec-123',
                nombre: 'Kumite Masculino -75kg',
                categoria: 'Cinturón Negro',
                estado: 'RUNNING'
            };

            this.competidorRojo = { nombre: 'Juan Pérez', academia: 'Dojo Cobra' };
            this.competidorAzul = { nombre: 'Carlos Díaz', academia: 'Eagle M.A.' };
        }, 1000);
    }

    actualizarEstado() {
        // Actualización en segundo plano
    }

    agregarPunto(color: 'rojo' | 'azul', puntos: number) {
        if (color === 'rojo') this.puntuaciones.rojo += puntos;
        else this.puntuaciones.azul += puntos;

        if (this.seccionActual && this.idCampeonato) {
            this.api.updateMatchScore(this.idCampeonato, 'current-match', this.puntuaciones).subscribe({
                next: () => { },
                error: () => { }
            });
        }
    }

    volverAtras() {
        this.router.navigate(['/mis-inscripciones']);
    }
}
