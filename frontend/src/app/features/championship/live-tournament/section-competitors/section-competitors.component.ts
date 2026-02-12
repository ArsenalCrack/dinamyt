
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

    printList() {
        window.print();
    }

    getStatusClass(status: string): any {
        switch (status) {
            case 'PRESENTE': return 'status-present';
            case 'AUSENTE': return 'status-absent';
            case 'DESCALIFICADO': return 'status-dq';
            default: return 'status-enrolled'; // INSCRITO
        }
    }

    formatStatus(status: string): string {
        switch (status) {
            case 'PRESENTE': return 'PRESENTE'; // or check-in icon?
            case 'AUSENTE': return 'AUSENTE';
            case 'DESCALIFICADO': return 'DESCALIF.';
            default: return 'INSCRITO';
        }
    }
}
