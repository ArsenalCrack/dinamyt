import { Component, Input, forwardRef, ElementRef, HostListener, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
    selector: 'app-searchable-select',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './searchable-select.component.html',
    styleUrls: ['./searchable-select.component.scss'],
    providers: [{
        provide: NG_VALUE_ACCESSOR,
        useExisting: forwardRef(() => SearchableSelectComponent),
        multi: true
    }]
})
export class SearchableSelectComponent implements ControlValueAccessor, OnInit, OnChanges {
    private static nextId = 0;

    @Input() options: Array<{ value: string; label: string }> = [];
    @Input() placeholder: string = 'Buscar...';
    @Input() name: string | null = null;
    @Input() inputId: string | null = null;
    @Input() disabled = false;

    searchText: string = '';
    isOpen = false;
    focusedIndex = -1;
    value: string | null = null;
    filteredOptions: Array<{ value: string; label: string }> = [];
    optionsStyle: { [key: string]: any } = {};
    touched = false;

    private onChange: (_: any) => void = () => { };
    private onTouched: () => void = () => { };

    constructor(private host: ElementRef) { }

    ngOnInit(): void {
        if (!this.inputId) {
            SearchableSelectComponent.nextId += 1;
            this.inputId = `dinamyt-searchable-select-${SearchableSelectComponent.nextId}`;
        }
        if (!this.name) {
            this.name = this.inputId;
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['options']) {
            this.filteredOptions = this.options;
            // If we have a value, ensure the label is correct (e.g. if loaded async)
            if (this.value) {
                const found = this.options.find(o => o.value === this.value);
                if (found) {
                    this.searchText = found.label;
                }
            }
        }
    }

    writeValue(obj: any): void {
        this.value = obj || null;
        const found = this.options.find(o => o.value === this.value);
        this.searchText = found ? found.label : '';
    }

    registerOnChange(fn: any): void { this.onChange = fn; }
    registerOnTouched(fn: any): void { this.onTouched = fn; }
    setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }

    onInputChange() {
        const search = this.searchText.toLowerCase().trim();

        if (!search) {
            this.filteredOptions = [...this.options];
            this.value = null; // Clear value if cleared text? Depends on UX.
            // Or keep value until new valid selection? 
            // User likely wants to clear.
            this.onChange(null);
        } else {
            this.filteredOptions = this.options.filter(opt =>
                opt.label.toLowerCase().includes(search)
            );
        }

        if (this.filteredOptions.length > 0 && !this.isOpen) {
            this.isOpen = true;
            this.focusedIndex = 0;
            this.positionOptions();
        }
    }

    onInputFocus() {
        if (!this.searchText) {
            this.filteredOptions = [...this.options];
        } else {
            this.onInputChange();
        }
        this.isOpen = true;
        this.focusedIndex = 0;
        this.positionOptions();
    }

    toggleDropdown() {
        if (this.disabled) return;
        if (this.isOpen) {
            this.close();
        } else {
            this.onInputFocus();
        }
    }

    selectOption(opt: { value: string; label: string }) {
        this.value = opt.value;
        this.searchText = opt.label;
        this.touched = true;
        this.onChange(this.value);
        this.onTouched();
        this.close();
    }

    onInputBlur() {
        this.touched = true;
        // Validate text matches an option
        const found = this.options.find(o => o.label === this.searchText);
        if (!found) {
            // If text doesn't match match, revert to last valid value or clear
            // If we want to allow clearing by deleting text
            if (this.searchText === '') {
                this.value = null;
                this.onChange(null);
            } else {
                // Restore display text of current value
                const current = this.options.find(o => o.value === this.value);
                this.searchText = current ? current.label : '';
            }
        } else {
            // Text matches a valid option, select it if not already
            if (this.value !== found.value) {
                this.value = found.value;
                this.onChange(this.value);
            }
        }
        this.onTouched();
    }

    close() {
        this.isOpen = false;
    }

    @HostListener('document:click', ['$event.target'])
    onClickOutside(target: EventTarget | null) {
        if (target && !this.host.nativeElement.contains(target as Node)) {
            // Validate on click outside
            this.onInputBlur();
            this.close();
        }
    }

    @HostListener('window:resize')
    onWindowResize() { if (this.isOpen) this.positionOptions(); }

    @HostListener('window:scroll')
    onWindowScroll() { if (this.isOpen) this.positionOptions(); }

    positionOptions() {
        try {
            const el = this.host.nativeElement as HTMLElement;
            const rect = el.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            const margin = 16;
            const preferredWidth = Math.max(rect.width, 200);
            const maxWidth = Math.min(preferredWidth, vw - margin * 2);

            let left = rect.left;
            if (left + maxWidth + margin > vw) left = Math.max(margin, vw - maxWidth - margin);
            if (left < margin) left = margin;

            const spaceBelow = vh - rect.bottom - margin;
            const maxHeight = 240;
            const gap = 8;

            let top: number | null = null;
            let bottom: number | null = null;
            if (spaceBelow >= 200 || spaceBelow >= (rect.top - margin)) {
                top = rect.bottom + gap;
            } else {
                bottom = vh - (rect.top - gap);
            }

            const style: any = {
                position: 'fixed',
                left: `${left}px`,
                width: `${maxWidth}px`,
                'max-height': `${maxHeight}px`,
                overflow: 'auto',
                zIndex: 9999
            };
            if (top !== null) style.top = `${top}px`; else style.bottom = `${bottom}px`;

            this.optionsStyle = style;
        } catch (e) {
            this.optionsStyle = {};
        }
    }
}
