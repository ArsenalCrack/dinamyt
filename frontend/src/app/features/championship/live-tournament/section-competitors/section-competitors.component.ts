
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-section-competitors',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './section-competitors.component.html',
    styleUrls: ['./section-competitors.component.scss']
})
export class SectionCompetitorsComponent {
    @Input() section: any;
    @Output() close = new EventEmitter<void>();

    imprimirLista() {
        window.print();
    }

    obtenerClaseEstado(estado: string): any {
        switch (estado) {
            case 'PRESENTE': return 'status-present';
            case 'AUSENTE': return 'status-absent';
            case 'DESCALIFICADO': return 'status-dq';
            default: return 'status-enrolled'; // INSCRITO
        }
    }

    formatearEstado(estado: string): string {
        switch (estado) {
            case 'PRESENTE': return 'PRESENTE';
            case 'AUSENTE': return 'AUSENTE';
            case 'DESCALIFICADO': return 'DESCALIF.';
            default: return 'INSCRITO';
        }
    }
}
