
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
}
