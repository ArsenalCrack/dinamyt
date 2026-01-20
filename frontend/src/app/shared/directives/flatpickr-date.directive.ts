import { Directive, ElementRef, Input, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import flatpickr from 'flatpickr';
import { Instance } from 'flatpickr/dist/types/instance';
import { BaseOptions } from 'flatpickr/dist/types/options';

@Directive({
    selector: '[appFlatpickrDate]',
    standalone: true
})
export class FlatpickrDateDirective implements OnInit, OnDestroy {
    @Input() config: Partial<BaseOptions> = {};
    @Input() dateValue: Date | string | null = null;
    @Input() fpMinDate: Date | string | undefined;
    @Output() dateValueChange = new EventEmitter<string>();

    private instance: Instance | undefined;

    constructor(private el: ElementRef) { }

    ngOnInit(): void {
        this.initFlatpickr();
    }

    ngOnDestroy(): void {
        if (this.instance) {
            this.instance.destroy();
        }
    }

    private initFlatpickr(): void {
        const options: Partial<BaseOptions> = {
            dateFormat: 'Y-m-d',
            allowInput: true,
            minDate: this.fpMinDate,
            ...this.config,
            defaultDate: this.dateValue || undefined,
            onChange: (selectedDates, dateStr) => {
                this.dateValueChange.emit(dateStr);
            }
        };
        this.instance = flatpickr(this.el.nativeElement, options);
    }
}
