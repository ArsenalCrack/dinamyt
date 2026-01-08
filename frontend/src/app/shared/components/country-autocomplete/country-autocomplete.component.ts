import { Component, Input, forwardRef, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-country-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './country-autocomplete.component.html',
  styleUrls: ['./country-autocomplete.component.scss'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => CountryAutocompleteComponent),
    multi: true
  }]
})
export class CountryAutocompleteComponent implements ControlValueAccessor {
  @Input() paises: string[] = [];
  @Input() placeholder: string = 'Buscar país...';
  @Input() disabled = false;
  @Input() hasError = false;

  searchText: string = '';
  isOpen = false;
  focusedIndex = -1;
  value: string = '';
  filteredPaises: string[] = [];
  optionsStyle: { [key: string]: any } = {};
  touched = false;

  private onChange: (_: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private host: ElementRef) {}

  writeValue(obj: any): void {
    this.value = obj || '';
    this.searchText = obj || '';
  }

  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }

  onInputChange() {
    // Filtrar países según lo que escribe el usuario
    const search = this.searchText.toLowerCase().trim();

    if (!search) {
      this.filteredPaises = [...this.paises];
    } else {
      this.filteredPaises = this.paises.filter(pais =>
        pais.toLowerCase().includes(search)
      );
    }

    // Abrir dropdown si hay resultados
    if (this.filteredPaises.length > 0 && !this.isOpen) {
      this.isOpen = true;
      this.focusedIndex = 0;
      this.positionOptions();
    }
  }

  onInputFocus() {
    // Mostrar todos los países al enfocar si no hay texto de búsqueda
    if (!this.searchText) {
      this.filteredPaises = [...this.paises];
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
      // Abrir el dropdown como si hicieran focus en el input
      if (!this.searchText) {
        this.filteredPaises = [...this.paises];
      } else {
        this.onInputChange();
      }
      this.isOpen = true;
      this.focusedIndex = 0;
      this.positionOptions();
    }
  }

  selectPais(pais: string) {
    this.value = pais;
    this.searchText = pais;
    this.touched = true;
    this.onChange(this.value);
    this.onTouched();
    this.close();
  }

  onInputBlur() {
    this.touched = true;
    // Si el texto no coincide con un país válido, limpiar
    if (this.searchText && !this.paises.includes(this.searchText)) {
      this.searchText = this.value || '';
    }
    this.onTouched();
  }

  close() {
    this.isOpen = false;
  }

  @HostListener('document:click', ['$event.target'])
  onClickOutside(target: EventTarget | null) {
    if (target && !this.host.nativeElement.contains(target as Node)) {
      // Si hay un valor seleccionado, restaurarlo
      if (this.value && this.searchText !== this.value) {
        this.searchText = this.value;
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
      // Mantener altura consistente de 240px como los otros selectores
      const maxHeight = 240;
      const gap = 8; // Gap entre el input y el dropdown

      let top: number | null = null;
      let bottom: number | null = null;
      if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
        // Abrir hacia abajo
        top = rect.bottom + gap;
      } else {
        // Abrir hacia arriba - calcular desde el borde inferior del viewport
        bottom = vh - (rect.top - gap);
      }

      const style: any = {
        position: 'fixed',
        left: `${left}px`,
        width: `${maxWidth}px`,
        'max-height': `${maxHeight}px`,
        overflow: 'auto'
      };
      if (top !== null) style.top = `${top}px`; else style.bottom = `${bottom}px`;

      this.optionsStyle = style;
    } catch (e) {
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
      this.focusedIndex = Math.min(this.focusedIndex + 1, this.filteredPaises.length - 1);
      this.scrollToFocused();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
      this.scrollToFocused();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pais = this.filteredPaises[this.focusedIndex];
      if (pais) this.selectPais(pais);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  scrollToFocused() {
    // Scroll automático al elemento enfocado
    setTimeout(() => {
      const optionsList = this.host.nativeElement.querySelector('.options');
      const focusedItem = this.host.nativeElement.querySelector('.focus');
      if (optionsList && focusedItem) {
        const itemTop = (focusedItem as HTMLElement).offsetTop;
        const itemHeight = (focusedItem as HTMLElement).offsetHeight;
        const listScrollTop = optionsList.scrollTop;
        const listHeight = optionsList.clientHeight;

        if (itemTop < listScrollTop) {
          optionsList.scrollTop = itemTop;
        } else if (itemTop + itemHeight > listScrollTop + listHeight) {
          optionsList.scrollTop = itemTop + itemHeight - listHeight;
        }
      }
    });
  }
}
