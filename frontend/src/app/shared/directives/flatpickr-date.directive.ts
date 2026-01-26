import { Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { NgControl } from '@angular/forms';
import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es';
import type { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import type { Options as FlatpickrOptions } from 'flatpickr/dist/types/options';

@Directive({
  selector: '[appFlatpickrDate]',
  standalone: true,
})
export class FlatpickrDateDirective implements OnInit, OnChanges, OnDestroy {
  private static nextAutoId = 1;

  @Input() fpMinDate?: string;
  @Input() fpMaxDate?: string;
  @Input() fpAppendTo?: HTMLElement;

  private instance: FlatpickrInstance | null = null;
  private removeGlobalListeners: (() => void) | null = null;
  private cleanupMonthDropdown: (() => void) | null = null;
  private calendarObserver: MutationObserver | null = null;
  private wasOpened = false;

  constructor(
    private readonly elementRef: ElementRef<HTMLInputElement>,
    private readonly zone: NgZone,
    private readonly ngControl: NgControl
  ) { }

  ngOnInit(): void {
    const input = this.elementRef.nativeElement;

    // Bloquear teclado para obligar a usar el calendario y mantener el formato
    input.readOnly = true;
    input.setAttribute('inputmode', 'none');
    input.setAttribute('autocomplete', 'off');

    const options: Partial<FlatpickrOptions> = {
      locale: Spanish,
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y', // Formato visible Ej: 25/12/2025
      altInputClass: 'dinamyt-date-input', // Clase para los estilos del proyecto
      allowInput: false,
      clickOpens: true,
      disableMobile: true, // Forzar el calendario custom incluso en móviles
      minDate: this.fpMinDate,
      maxDate: this.fpMaxDate,
      appendTo: this.fpAppendTo || undefined,
      onReady: (_dStr, _dObj, instance) => {
        // Clase al popup para estilos rojos/redondeados
        instance.calendarContainer.classList.add('dinamyt-flatpickr-theme');

        // El input visible real es el `altInput`; el placeholder del input original no se copia automáticamente.
        const placeholder = input.getAttribute('placeholder');
        if (placeholder && instance.altInput) {
          instance.altInput.setAttribute('placeholder', placeholder);
        }

        // Accesibilidad/autofill: el input visible es el altInput, así que debe tener name/id/aria-label
        // (Chrome Lighthouse lanza warnings si no los tiene).
        if (instance.altInput) {
          const baseName = input.getAttribute('name') || input.getAttribute('ng-reflect-name');
          if (baseName && !instance.altInput.getAttribute('name')) {
            instance.altInput.setAttribute('name', baseName);
          }

          // Evitar ids duplicados: si el input original tiene id, el altInput usa un sufijo.
          const originalId = input.getAttribute('id');
          if (originalId) {
            instance.altInput.setAttribute('id', `${originalId}__alt`);
          } else if (!instance.altInput.getAttribute('id')) {
            const autoId = `dinamyt-fp-${FlatpickrDateDirective.nextAutoId++}`;
            instance.altInput.setAttribute('id', `${autoId}__alt`);
          }

          const ariaLabel =
            input.getAttribute('aria-label') ||
            placeholder ||
            'Seleccionar fecha';
          instance.altInput.setAttribute('aria-label', ariaLabel);

          // Mantener consistencia con el input original
          instance.altInput.setAttribute('autocomplete', 'off');
        }

        const baseName = input.getAttribute('name') || input.getAttribute('ng-reflect-name') || 'fecha';
        const baseId =
          input.getAttribute('id') ||
          instance.altInput?.getAttribute('id')?.replace(/__alt$/, '') ||
          `dinamyt-fp-internal-${FlatpickrDateDirective.nextAutoId++}`;

        const meta = { baseId, baseName };
        this.ensureInternalControlsLabeled(instance, meta);

        // A veces Flatpickr re-renderiza el header (mes/año) y vuelve a crear inputs sin id/name.
        // Observamos el calendario para re-aplicar atributos y evitar warnings intermitentes.
        this.calendarObserver?.disconnect();
        this.calendarObserver = new MutationObserver(() => {
          this.ensureInternalControlsLabeled(instance, meta);
          this.ensureCalendarContainerHasIds(instance, meta);
        });
        this.calendarObserver.observe(instance.calendarContainer, { childList: true, subtree: true });

        // No permitir escribir el año manualmente (solo flechas)
        const yearEl = (instance as any).currentYearElement as HTMLInputElement | undefined;
        if (yearEl) {
          yearEl.readOnly = true;
          yearEl.setAttribute('inputmode', 'none');
          yearEl.setAttribute('aria-label', 'Año (usar flechas para cambiar)');
        }

        // Reemplazar el select nativo del mes por uno custom (estilo del proyecto, animado)
        this.cleanupMonthDropdown = this.installCustomMonthDropdown(instance, meta);

        // Si hay minDate (p.ej. fecha fin >= fecha inicio), no permitir navegar/mostrar meses anteriores.
        this.clampViewToMinDate(instance);
        this.syncMonthDropdownDisabled(instance);

        // Compactar cuando el mes requiere 6 semanas (sin ocultar días)
        this.toggleSixWeeksCompact(instance);
      },
      onOpen: (_dStr, _dObj, instance) => {
        this.wasOpened = true;
        // Flatpickr puede re-renderizar header en open; re-aplicamos labels/ids.
        const baseName = input.getAttribute('name') || input.getAttribute('ng-reflect-name') || 'fecha';
        const baseId =
          input.getAttribute('id') ||
          instance.altInput?.getAttribute('id')?.replace(/__alt$/, '') ||
          `dinamyt-fp-internal-${FlatpickrDateDirective.nextAutoId++}`;
        this.ensureInternalControlsLabeled(instance, { baseId, baseName });

        // Si hay minDate y el calendario está en un mes anterior, saltar al mes de minDate.
        // Además, esto hace que “fecha fin” abra directamente en el mes de la fecha inicio.
        this.clampViewToMinDate(instance);
        this.syncMonthDropdownDisabled(instance);

        // Buenas prácticas UX: si el usuario hace scroll/resize, cerramos el calendario para evitar
        // que quede flotando sobre la navbar o en posiciones raras.
        const closeOnScroll = (ev: Event) => {
          const target = ev.target as Node | null;
          // Si el scroll ocurre dentro del calendario (incluye el dropdown de meses), NO cerramos.
          if (target && instance.calendarContainer.contains(target)) return;
          instance.close();
        };

        const closeOnResize = () => instance.close();

        window.addEventListener('scroll', closeOnScroll, { capture: true, passive: true });
        window.addEventListener('resize', closeOnResize, { passive: true });

        this.removeGlobalListeners = () => {
          window.removeEventListener('scroll', closeOnScroll, true);
          window.removeEventListener('resize', closeOnResize);
        };
      },
      onClose: () => {
        this.removeGlobalListeners?.();
        this.removeGlobalListeners = null;

        if (this.wasOpened) {
          this.wasOpened = false;
          this.zone.run(() => {
            this.ngControl.control?.markAsTouched();
            this.ngControl.control?.updateValueAndValidity({ emitEvent: false });
          });
        }
      },
      onMonthChange: (_dStr, _dObj, instance) => {
        // Mantener sincronizado el label del dropdown custom si cambias con flechas
        const label = instance.calendarContainer.querySelector<HTMLElement>('[data-dinamyt-fp-month-label]');
        if (label) {
          const months = instance.l10n?.months?.longhand;
          if (months && months[instance.currentMonth]) {
            label.textContent = months[instance.currentMonth];
          }
        }

        const baseName = input.getAttribute('name') || input.getAttribute('ng-reflect-name') || 'fecha';
        const baseId =
          input.getAttribute('id') ||
          instance.altInput?.getAttribute('id')?.replace(/__alt$/, '') ||
          `dinamyt-fp-internal-${FlatpickrDateDirective.nextAutoId++}`;
        this.ensureInternalControlsLabeled(instance, { baseId, baseName });

        this.clampViewToMinDate(instance);
        this.syncMonthDropdownDisabled(instance);

        this.toggleSixWeeksCompact(instance);
      },
      onYearChange: (_dStr, _dObj, instance) => {
        const baseName = input.getAttribute('name') || input.getAttribute('ng-reflect-name') || 'fecha';
        const baseId =
          input.getAttribute('id') ||
          instance.altInput?.getAttribute('id')?.replace(/__alt$/, '') ||
          `dinamyt-fp-internal-${FlatpickrDateDirective.nextAutoId++}`;
        this.ensureInternalControlsLabeled(instance, { baseId, baseName });

        this.clampViewToMinDate(instance);
        this.syncMonthDropdownDisabled(instance);
        this.toggleSixWeeksCompact(instance);
      },
      onChange: (selectedDates, dateStr) => {
        // Propagar cambios a Angular Forms
        this.zone.run(() => {
          this.ngControl.control?.setValue(dateStr);
          // Considerar interacción del usuario como 'touched'
          this.ngControl.control?.markAsTouched();
        });
      }
    };

    // Establecer fecha inicial si ya existe en el control o input
    const initialValue = this.ngControl.value || input.value;
    if (initialValue) {
      options.defaultDate = initialValue;
    }

    this.zone.runOutsideAngular(() => {
      this.instance = flatpickr(input, options);
    });

    // Suscribirse a cambios externos del modelo (ej: cargar borrador)
    if (this.ngControl.control) {
      this.ngControl.control.valueChanges.subscribe((val) => {
        // Evitar bucle infinito si el cambio vino del propio flatpickr
        if (this.instance && val) {
          const currentDate = this.instance.selectedDates[0];
          const newDate = this.instance.parseDate(val, 'Y-m-d');
          // Solo actualizar si la fecha es distinta (ignorando hora)
          if (
            !currentDate ||
            (newDate &&
              (currentDate.getFullYear() !== newDate.getFullYear() ||
                currentDate.getMonth() !== newDate.getMonth() ||
                currentDate.getDate() !== newDate.getDate()))
          ) {
            this.instance.setDate(val, false); // false = no disparar onChange
          }
        } else if (this.instance && !val) {
          this.instance.clear(false);
        }
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.instance) return;

    if (changes['fpMinDate']) {
      this.instance.set('minDate', this.fpMinDate);
      // Si el valor actual queda fuera, limpiarlo para evitar inconsistencias.
      const min = this.getMinDate(this.instance);
      const selected = this.instance.selectedDates?.[0];
      if (min && selected && this.dateOnlyKey(selected) < this.dateOnlyKey(min)) {
        this.instance.clear();
      }

      this.clampViewToMinDate(this.instance);
      this.syncMonthDropdownDisabled(this.instance);
    }
    if (changes['fpMaxDate']) {
      this.instance.set('maxDate', this.fpMaxDate);
    }
  }

  ngOnDestroy(): void {
    this.removeGlobalListeners?.();
    this.removeGlobalListeners = null;

    this.cleanupMonthDropdown?.();
    this.cleanupMonthDropdown = null;

    this.calendarObserver?.disconnect();
    this.calendarObserver = null;

    this.instance?.destroy();
    this.instance = null;
  }

  private installCustomMonthDropdown(
    instance: FlatpickrInstance,
    meta: { baseId: string; baseName: string }
  ): (() => void) {
    const container = instance.calendarContainer;
    const currentMonth = container.querySelector<HTMLElement>('.flatpickr-current-month');
    const nativeSelect = container.querySelector<HTMLSelectElement>('.flatpickr-monthDropdown-months');
    if (!currentMonth || !nativeSelect) return () => { };

    // Ocultar el select nativo
    nativeSelect.classList.add('dinamyt-fp-hidden-native');

    // Crear dropdown custom
    const dropdown = document.createElement('div');
    dropdown.className = 'dinamyt-fp-month-select';
    dropdown.setAttribute('role', 'button');
    dropdown.setAttribute('tabindex', '0');
    dropdown.setAttribute('aria-label', 'Seleccionar mes');
    dropdown.setAttribute('title', 'Seleccionar mes');
    dropdown.setAttribute('aria-haspopup', 'listbox');
    dropdown.setAttribute('aria-expanded', 'false');
    dropdown.setAttribute('id', `${meta.baseId}__month_trigger`);
    dropdown.setAttribute('name', `${meta.baseName}__month_trigger`);

    const label = document.createElement('span');
    label.className = 'dinamyt-fp-month-label';
    label.setAttribute('data-dinamyt-fp-month-label', 'true');
    label.setAttribute('id', `${meta.baseId}__month_label`);
    const months = instance.l10n?.months?.longhand;
    label.textContent = months?.[instance.currentMonth] ?? '';

    const arrow = document.createElement('span');
    arrow.className = 'dinamyt-fp-month-arrow';

    const list = document.createElement('ul');
    list.className = 'dinamyt-fp-month-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('id', `${meta.baseId}__month_list`);
    list.setAttribute('name', `${meta.baseName}__month_list`);
    list.setAttribute('aria-labelledby', `${meta.baseId}__month_label`);
    // Algunos validadores lo toman como referencia directa del nombre accesible.
    list.setAttribute('aria-label', 'Opciones de mes');
    list.setAttribute('title', 'Opciones de mes');

    (months ?? []).forEach((monthName, monthIndex) => {
      const li = document.createElement('li');
      li.className = 'dinamyt-fp-month-option';
      li.textContent = monthName;
      li.setAttribute('role', 'option');
      li.setAttribute('data-dinamyt-fp-month-option', String(monthIndex));

      li.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        // Respetar minDate: no permitir elegir meses anteriores al mes de minDate
        const min = this.getMinDate(instance);
        if (min) {
          const minYear = min.getFullYear();
          const minMonth = min.getMonth();
          if (instance.currentYear === minYear && monthIndex < minMonth) {
            return;
          }
        }

        instance.changeMonth(monthIndex - instance.currentMonth, true);
        label.textContent = monthName;
        dropdown.classList.remove('open');
      });

      list.appendChild(li);
    });

    dropdown.appendChild(label);
    dropdown.appendChild(arrow);
    dropdown.appendChild(list);

    const toggle = (ev?: Event) => {
      ev?.preventDefault();
      dropdown.classList.toggle('open');
      dropdown.setAttribute('aria-expanded', dropdown.classList.contains('open') ? 'true' : 'false');
    };

    const close = () => {
      dropdown.classList.remove('open');
      dropdown.setAttribute('aria-expanded', 'false');
    };
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (!dropdown.contains(target)) close();
    };

    dropdown.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggle(ev);
    });
    dropdown.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.stopPropagation();
        toggle(ev);
      }
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        close();
      }
    });

    document.addEventListener('click', onDocClick, { capture: true });

    // Insertarlo antes del año (mantiene el layout del header)
    currentMonth.insertBefore(dropdown, nativeSelect);

    // Aplicar estado disabled según minDate (si corresponde)
    this.syncMonthDropdownDisabled(instance);

    return () => {
      document.removeEventListener('click', onDocClick, true);
      dropdown.remove();
      nativeSelect.classList.remove('dinamyt-fp-hidden-native');
    };
  }

  private ensureInternalControlsLabeled(
    instance: FlatpickrInstance,
    meta: { baseId: string; baseName: string }
  ): void {
    const monthSelect = instance.calendarContainer.querySelector<HTMLSelectElement>('.flatpickr-monthDropdown-months');
    if (monthSelect) {
      if (!monthSelect.getAttribute('id')) monthSelect.setAttribute('id', `${meta.baseId}__month`);
      if (!monthSelect.getAttribute('name')) monthSelect.setAttribute('name', `${meta.baseName}__month`);
      monthSelect.setAttribute('autocomplete', 'off');
    }

    const yearEl = (instance as any).currentYearElement as HTMLInputElement | undefined;
    if (yearEl) {
      if (!yearEl.getAttribute('id')) yearEl.setAttribute('id', `${meta.baseId}__year`);
      if (!yearEl.getAttribute('name')) yearEl.setAttribute('name', `${meta.baseName}__year`);
      yearEl.setAttribute('autocomplete', 'off');
    }
  }

  private ensureCalendarContainerHasIds(
    instance: FlatpickrInstance,
    meta: { baseId: string; baseName: string }
  ): void {
    const controls = instance.calendarContainer.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea'
    );
    let autoIndex = 0;
    controls.forEach((el) => {
      // No tocar inputs del usuario; esto solo aplica al DOM interno del calendario.
      // (calendarContainer es creado por Flatpickr).
      if (!el.getAttribute('id')) {
        el.setAttribute('id', `${meta.baseId}__fp_${autoIndex}`);
      }
      if (!el.getAttribute('name')) {
        el.setAttribute('name', `${meta.baseName}__fp_${autoIndex}`);
      }
      if (!el.getAttribute('autocomplete')) {
        el.setAttribute('autocomplete', 'off');
      }
      autoIndex += 1;
    });
  }

  private parseIsoDateLocal(iso: string): Date | null {
    // Espera YYYY-MM-DD
    const parts = iso.split('-').map((p) => Number(p));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
    const [y, m, d] = parts;
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  private dateOnlyKey(date: Date): number {
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  }

  private getMinDate(instance: FlatpickrInstance): Date | null {
    const min = instance.config.minDate as unknown;
    if (!min) return null;
    if (min instanceof Date) return min;
    if (typeof min === 'string') return this.parseIsoDateLocal(min);
    return null;
  }

  private clampViewToMinDate(instance: FlatpickrInstance): void {
    const min = this.getMinDate(instance);
    if (!min) return;

    const currentIsBeforeMinMonth =
      instance.currentYear < min.getFullYear() ||
      (instance.currentYear === min.getFullYear() && instance.currentMonth < min.getMonth());

    if (currentIsBeforeMinMonth) {
      instance.jumpToDate(min, true);
    }

    // Asegurar que el label del mes (custom) queda sincronizado después de jumpToDate.
    const label = instance.calendarContainer.querySelector<HTMLElement>('[data-dinamyt-fp-month-label]');
    if (label) {
      const months = instance.l10n?.months?.longhand;
      if (months && months[instance.currentMonth]) {
        label.textContent = months[instance.currentMonth];
      }
    }

    // Deshabilitar flecha “prev” si estamos en el mes mínimo
    const prev = (instance as any).prevMonthNav as HTMLElement | undefined;
    if (prev) {
      const atMinMonth = instance.currentYear === min.getFullYear() && instance.currentMonth === min.getMonth();
      prev.classList.toggle('flatpickr-disabled', atMinMonth);
      prev.setAttribute('aria-disabled', atMinMonth ? 'true' : 'false');
    }
  }

  private syncMonthDropdownDisabled(instance: FlatpickrInstance): void {
    const min = this.getMinDate(instance);
    const options = Array.from(
      instance.calendarContainer.querySelectorAll<HTMLElement>('[data-dinamyt-fp-month-option]')
    );
    if (!options.length) return;

    const minYear = min?.getFullYear();
    const minMonth = min?.getMonth();

    options.forEach((el) => {
      const idxRaw = el.getAttribute('data-dinamyt-fp-month-option');
      const monthIndex = idxRaw ? Number(idxRaw) : NaN;
      if (Number.isNaN(monthIndex)) return;

      const disabled =
        !!min && instance.currentYear === minYear && typeof minMonth === 'number' && monthIndex < minMonth;

      // Para el caso "fecha fin": si el año es el mismo del minDate, ocultar meses anteriores
      // para que el dropdown muestre automáticamente desde el mes mínimo en adelante.
      const hidden =
        !!min && instance.currentYear === minYear && typeof minMonth === 'number' && monthIndex < minMonth;

      el.classList.toggle('dinamyt-fp-month-option--disabled', disabled);
      el.classList.toggle('dinamyt-fp-month-option--hidden', hidden);
      el.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    });
  }

  private toggleSixWeeksCompact(instance: FlatpickrInstance): void {
    const container = instance.calendarContainer;
    const dayContainer = container.querySelector<HTMLElement>('.dayContainer');
    if (!dayContainer) return;

    const days = Array.from(dayContainer.querySelectorAll<HTMLElement>('.flatpickr-day'));
    if (days.length < 42) {
      container.classList.remove('dinamyt-fp-compact-6w');
      return;
    }

    const lastWeek = days.slice(35, 42);
    // Si la última semana tiene algún día del mes actual, entonces el mes "usa" 6 semanas.
    const monthUsesSixWeeks = lastWeek.some(
      (d) => !d.classList.contains('prevMonthDay') && !d.classList.contains('nextMonthDay')
    );

    if (monthUsesSixWeeks) {
      container.classList.add('dinamyt-fp-compact-6w');
    } else {
      container.classList.remove('dinamyt-fp-compact-6w');
    }
  }

}

