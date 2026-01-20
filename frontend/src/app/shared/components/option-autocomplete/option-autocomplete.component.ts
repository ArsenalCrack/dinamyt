import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, OnChanges, OnInit, SimpleChanges, forwardRef } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

export type AutocompleteOption = { value: any; label: string; disabled?: boolean };

@Component({
  selector: 'app-option-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './option-autocomplete.component.html',
  styleUrls: ['./option-autocomplete.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => OptionAutocompleteComponent),
      multi: true
    }
  ]
})
export class OptionAutocompleteComponent implements ControlValueAccessor, OnChanges, OnInit {
  private static nextId = 0;

  @Input() options: AutocompleteOption[] = [];
  @Input() placeholder: string = '';
  @Input() name: string | null = null;
  @Input() inputId: string | null = null;
  @Input() ariaLabel: string | null = null;
  @Input() disabled = false;
  @Input() hasError = false;

  searchText = '';
  isOpen = false;
  focusedIndex = -1;
  value: any = null;
  filteredOptions: AutocompleteOption[] = [];
  optionsStyle: { [key: string]: any } = {};

  private onChange: (_: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private host: ElementRef) {}

  ngOnInit(): void {
    if (!this.inputId) {
      OptionAutocompleteComponent.nextId += 1;
      this.inputId = `dinamyt-option-autocomplete-${OptionAutocompleteComponent.nextId}`;
    }
    if (!this.name) {
      this.name = this.inputId;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      // Cuando las opciones llegan async (ej. desde BD), sincronizar el texto visible
      // siempre que el usuario no esté escribiendo activamente.
      if (!this.isOpen) {
        this.syncSearchTextFromValue();
      } else {
        // Si está abierto, re-filtrar manteniendo el texto actual
        this.onInputChange();
      }
    }
  }

  writeValue(obj: any): void {
    this.value = obj ?? null;
    this.syncSearchTextFromValue();
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInputChange() {
    const search = (this.searchText || '').toLowerCase().trim();

    if (!search) {
      this.filteredOptions = [...this.options];
    } else {
      this.filteredOptions = this.options.filter(opt => (opt.label || '').toLowerCase().includes(search));
    }

    if (!this.isOpen) {
      this.isOpen = true;
    }
    this.focusedIndex = this.filteredOptions.length > 0 ? 0 : -1;
    this.positionOptions();
  }

  onInputFocus() {
    if (this.disabled) return;

    // Igual que Nacionalidad: al enfocar, mostrar todas las opciones.
    // El filtrado ocurre cuando el usuario escribe.
    this.filteredOptions = [...this.options];
    this.isOpen = true;
    this.focusedIndex = this.filteredOptions.length > 0 ? 0 : -1;
    this.positionOptions();
  }

  toggleDropdown() {
    if (this.disabled) return;

    if (this.isOpen) {
      this.close();
      return;
    }

    // Abrir mostrando todas las opciones; el filtrado es al escribir.
    this.filteredOptions = [...this.options];
    this.isOpen = true;
    this.focusedIndex = this.filteredOptions.length > 0 ? 0 : -1;
    this.positionOptions();
  }

  selectOption(opt: AutocompleteOption) {
    if (opt.disabled) return;
    this.value = opt.value;
    this.searchText = opt.label;
    this.onChange(this.value);
    this.onTouched();
    this.close();
  }

  onInputBlur() {
    // Si el texto no coincide con una opción válida, restaurar el label seleccionado
    const exact = this.findOptionByLabel(this.searchText);
    if (this.searchText && !exact) {
      this.syncSearchTextFromValue();
    }
    this.onTouched();
  }

  close() {
    this.isOpen = false;
  }

  private syncSearchTextFromValue() {
    const found = this.findOptionByValue(this.value);
    this.searchText = found ? found.label : '';
  }

  private findOptionByValue(value: any): AutocompleteOption | undefined {
    return this.options.find(o => this.compareValues(o.value, value));
  }

  private findOptionByLabel(label: string): AutocompleteOption | undefined {
    const needle = (label || '').trim().toLowerCase();
    if (!needle) return undefined;
    return this.options.find(o => (o.label || '').trim().toLowerCase() === needle);
  }

  compareValues(a: any, b: any): boolean {
    if (a === null && b === null) return true;
    if (a === undefined && b === undefined) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;
    return String(a) === String(b);
  }

  @HostListener('document:click', ['$event.target'])
  onClickOutside(target: EventTarget | null) {
    if (target && !this.host.nativeElement.contains(target as Node)) {
      // restaurar label seleccionado si el usuario dejó un texto inválido
      const exact = this.findOptionByLabel(this.searchText);
      if (this.searchText && !exact) {
        this.syncSearchTextFromValue();
      }
      this.close();
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (this.isOpen) this.positionOptions();
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    if (this.isOpen) this.positionOptions();
  }

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
      const spaceAbove = rect.top - margin;
      const maxHeight = 240;
      const gap = 8;

      let top: number | null = null;
      let bottom: number | null = null;
      if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
        top = rect.bottom + gap;
      } else {
        bottom = vh - (rect.top - gap);
      }

      const style: any = {
        position: 'fixed',
        left: `${left}px`,
        width: `${maxWidth}px`,
        'max-height': `${maxHeight}px`,
        overflow: 'auto'
      };

      if (top !== null) style.top = `${top}px`;
      else style.bottom = `${bottom}px`;

      this.optionsStyle = style;
    } catch {
      this.optionsStyle = {};
    }
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.isOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.onInputFocus();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.focusedIndex = Math.min(this.focusedIndex + 1, this.filteredOptions.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const opt = this.filteredOptions[this.focusedIndex];
      if (opt) this.selectOption(opt);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }
}
