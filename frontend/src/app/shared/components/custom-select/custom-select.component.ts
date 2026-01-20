import { Component, ElementRef, HostListener, Input, OnInit, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-custom-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './custom-select.component.html',
  styleUrls: ['./custom-select.component.scss'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => CustomSelectComponent),
    multi: true
  }]
})
export class CustomSelectComponent implements ControlValueAccessor, OnInit {
  private static nextId = 0;

  @Input() options: Array<{ value: any; label: string; disabled?: boolean }> = [];
  @Input() placeholder: string = '';
  @Input() disabled = false;
  @Input() ariaLabel: string | null = null;
  @Input() inputId: string | null = null;
  @Input() name: string | null = null;
  @Input() autocomplete: string | null = 'off';

  isOpen = false;
  focusedIndex = -1;
  value: any = null;
  optionsStyle: { [key: string]: any } = {};

  private hasUserInteracted = false;

  private onChange: (_: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private host: ElementRef) {}

  ngOnInit(): void {
    if (!this.inputId) {
      CustomSelectComponent.nextId += 1;
      this.inputId = `dinamyt-custom-select-${CustomSelectComponent.nextId}`;
    }

    if (!this.name) {
      const hostName = (this.host.nativeElement as HTMLElement).getAttribute('name');
      this.name = hostName || this.inputId;
    }
  }

  writeValue(obj: any): void { this.value = obj; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }

  toggle() {
    if (this.disabled) return;

    const nextOpen = !this.isOpen;
    if (nextOpen) this.hasUserInteracted = true;
    // Si el usuario abre y vuelve a cerrar sin seleccionar, considerar el control "tocado"
    if (this.isOpen && !nextOpen) this.onTouched();

    this.isOpen = nextOpen;
    if (this.isOpen) {
      const idx = this.options.findIndex(o => this.compareValues(o.value, this.value));
      this.focusedIndex = idx >= 0 ? idx : 0;
      this.positionOptions();
    }
  }

  selectOption(opt: any) {
    if (opt.disabled) return;
    this.value = opt.value;
    this.onChange(this.value);
    this.hasUserInteracted = true;
    this.onTouched();
    this.close();
  }

  getLabel() {
    const found = this.options.find(o => this.compareValues(o.value, this.value));
    return found ? found.label : '';
  }

  compareValues(a: any, b: any): boolean {
    if (a === null && b === null) return true;
    if (a === undefined && b === undefined) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;
    return String(a) === String(b);
  }

  close() { this.isOpen = false; }

  @HostListener('focusout')
  onFocusOut() {
    // No marcar como touched si el usuario nunca interactuó con el control.
    if (!this.hasUserInteracted) return;
    this.onTouched();
  }

  @HostListener('document:click', ['$event.target'])
  onClickOutside(target: EventTarget | null) {
    if (target && !this.host.nativeElement.contains(target as Node)) {
      // Si el dropdown estaba abierto, el usuario ya interactuó.
      if (this.isOpen) this.hasUserInteracted = true;
      if (this.hasUserInteracted) this.onTouched();
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

  @HostListener('window:touchmove')
  onTouchMove() {
    if (this.isOpen) this.positionOptions();
  }

  // Position the options dropdown within the viewport to avoid creating page scrollbars
  positionOptions() {
    try {
      const el = this.host.nativeElement as HTMLElement;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // preferred width: at least element width, up to viewport minus margins
      const margin = 16;
      const preferredWidth = Math.max(rect.width, 160);
      const maxWidth = Math.min(preferredWidth, vw - margin * 2);

      // compute left so dropdown stays within viewport
      let left = rect.left;
      if (left + maxWidth + margin > vw) left = Math.max(margin, vw - maxWidth - margin);
      if (left < margin) left = margin;

      // space below and above (relative to viewport)
      const spaceBelow = vh - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      // use the larger side to keep the dropdown height consistent when it opens upward
      const availableSpace = Math.max(spaceBelow, spaceAbove);
      const maxHeight = Math.max(Math.min(240, availableSpace), 120);

      // choose vertical placement: prefer below when space is equal or greater
      let top: number | null = null;
      let bottom: number | null = null;
      if (spaceBelow >= spaceAbove) {
        // place below using viewport coordinates (rect.bottom is viewport-relative)
        top = rect.bottom + 8;
      } else {
        // place above: compute bottom distance from viewport bottom
        bottom = vh - rect.top + 8;
      }

      const style: any = {
        position: 'fixed',
        left: `${left}px`,
        width: `${maxWidth}px`,
        'max-height': `${Math.floor(maxHeight)}px`,
        overflow: 'auto'
      };
      if (top !== null) style.top = `${top}px`; else style.bottom = `${bottom}px`;

      this.optionsStyle = style;
    } catch (e) {
      this.optionsStyle = {};
    }
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.isOpen && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); this.toggle(); return;
    }
    if (!this.isOpen) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); this.focusedIndex = Math.min(this.focusedIndex + 1, this.options.length - 1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); this.focusedIndex = Math.max(this.focusedIndex - 1, 0); }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const opt = this.options[this.focusedIndex]; if (opt) this.selectOption(opt); }
    if (event.key === 'Escape') { event.preventDefault(); this.close(); }
  }
}
