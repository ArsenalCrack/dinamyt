
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../../core/services/api.service';

export interface Juez {
    id: string; // idDocumento
    nombre: string;
    avatar: string;
    rol?: string; // Rol en el sistema (ej: 'Referi de Esquina', 'Referi Central')
    categoria?: string;
    pais?: string;
    ciudad?: string;
    asignadoATatami?: boolean; // Si está asignado a CUALQUIER tatami
}

@Component({
    selector: 'app-assign-judges',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './assign-judges.component.html',
    styleUrls: ['./assign-judges.component.scss']
})
export class AssignJudgesComponent implements OnInit {
    @Input() championshipId: string | null = null;
    @Input() tatami: any; // Objeto Tatami
    @Input() allTatamis: any[] = []; // Para verificar otras asignaciones
    @Output() close = new EventEmitter<void>();
    @Output() save = new EventEmitter<any>();

    jueces: Juez[] = [];
    juecesFiltrados: Juez[] = [];
    cargando = true;
    busqueda = '';

    // Asignaciones para ESTE tatami
    juezCentral: Juez | null = null;
    juezMesa: Juez | null = null;
    juezRunning: Juez | null = null;
    juecesNormales: Juez[] = [];

    constructor(private api: ApiService) { }

    ngOnInit(): void {
        this.cargarJueces();
    }

    cargarJueces() {
        if (!this.championshipId) return;
        this.cargando = true;

        this.api.obtenerJuecesDelCampeonato(this.championshipId).subscribe({
            next: (data: any[]) => {
                this.jueces = (data || []).map(j => ({
                    id: j.id || j.idDocumento,
                    nombre: j.nombre || j.nombreC || j.nombre_completo,
                    avatar: j.avatar || 'assets/avatar-1.png',
                    rol: j.rol || 'Referi de Esquina',
                    categoria: j.categoria || j.cinturonRango || 'N/A',
                    pais: j.pais || j.nacionalidad,
                    ciudad: j.ciudad,
                    asignadoATatami: false
                }));

                this.restaurarAsignaciones();
                this.verificarAsignaciones();
                this.filtrarJueces();
                this.cargando = false;
            },
            error: (e) => {
                console.error('Error cargando jueces', e);
                this.cargando = false;
            }
        });
    }

    // Verificar contra todos los tatamis para marcar jueces asignados
    verificarAsignaciones() {
        // Primero, marcar todos como no asignados
        this.jueces.forEach(j => j.asignadoATatami = false);

        // Verificar otros tatamis
        this.allTatamis.forEach(t => {
            // Saltar tatami actual
            if (String(t.id) === String(this.tatami.id)) return;

            if (t.juecesAsignados) {
                const aj = t.juecesAsignados;
                if (aj.central) this.marcarComoOcupado(aj.central.id);
                if (aj.table) this.marcarComoOcupado(aj.table.id);
                if (aj.running) this.marcarComoOcupado(aj.running.id);
                if (aj.normal && Array.isArray(aj.normal)) {
                    aj.normal.forEach((j: any) => this.marcarComoOcupado(j.id));
                }
            }
        });
    }

    marcarComoOcupado(id: string) {
        const juez = this.jueces.find(j => String(j.id) === String(id));
        if (juez) juez.asignadoATatami = true;
    }

    restaurarAsignaciones() {
        if (this.tatami && this.tatami.juecesAsignados) {
            const aj = this.tatami.juecesAsignados;
            // Buscar los objetos de juez reales en nuestra lista cargada
            if (aj.central) {
                this.juezCentral = this.jueces.find(j => String(j.id) === String(aj.central.id)) || aj.central;
            }
            if (aj.table) {
                this.juezMesa = this.jueces.find(j => String(j.id) === String(aj.table.id)) || aj.table;
            }
            if (aj.running) {
                this.juezRunning = this.jueces.find(j => String(j.id) === String(aj.running.id)) || aj.running;
            }
            if (aj.normal && Array.isArray(aj.normal)) {
                this.juecesNormales = aj.normal.map((nj: any) =>
                    this.jueces.find(j => String(j.id) === String(nj.id)) || nj
                );
            }
        }
    }

    filtrarJueces() {
        const q = this.busqueda.toLowerCase();
        this.juecesFiltrados = this.jueces.filter(j =>
            !j.asignadoATatami &&
            !this.estaSeleccionado(j) &&
            (j.nombre.toLowerCase().includes(q) || (j.rol && j.rol.toLowerCase().includes(q)))
        );
    }

    estaSeleccionado(j: Juez): boolean {
        return (this.juezCentral?.id === j.id) ||
            (this.juezMesa?.id === j.id) ||
            (this.juezRunning?.id === j.id) ||
            this.juecesNormales.some(nj => nj.id === j.id);
    }

    asignarCentral(j: Juez) {
        if (this.juezCentral) {
            // Devolver el anterior al pool
        }
        this.juezCentral = j;
        this.filtrarJueces();
    }

    asignarMesa(j: Juez) {
        this.juezMesa = j;
        this.filtrarJueces();
    }

    asignarRunning(j: Juez) {
        this.juezRunning = j;
        this.filtrarJueces();
    }

    asignarNormal(j: Juez) {
        this.juecesNormales.push(j);
        this.filtrarJueces();
    }

    desasignarCentral() {
        this.juezCentral = null;
        this.filtrarJueces();
    }

    desasignarMesa() {
        this.juezMesa = null;
        this.filtrarJueces();
    }

    desasignarRunning() {
        this.juezRunning = null;
        this.filtrarJueces();
    }

    desasignarNormal(indice: number) {
        this.juecesNormales.splice(indice, 1);
        this.filtrarJueces();
    }

    guardar() {
        const resultado = {
            central: this.juezCentral,
            table: this.juezMesa,
            running: this.juezRunning,
            normal: this.juecesNormales
        };
        this.save.emit(resultado);
    }
}
