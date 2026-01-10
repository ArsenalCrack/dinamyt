import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Location } from '@angular/common';

interface CategoriaConfig {
  nombre: string;
  activa: boolean;
  tipo: 'individual' | 'rango'; // Para cinturón, edad, peso
  valor?: string;
  desde?: string;
  hasta?: string;
}

interface ModalidadConfig {
  id: string;
  nombre: string;
  activa: boolean;
  expanded: boolean;
  categorias: {
    cinturon: CategoriaConfig[];
    edad: CategoriaConfig[];
    peso: CategoriaConfig[];
    genero: 'individual' | 'mixto' | null;
  };
}

interface CampeonatoForm {
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  ubicacion: string;
  alcance: string;
  numTatamis: number;
}

@Component({
  selector: 'app-create-championship',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './create-championship.component.html',
  styleUrls: ['./create-championship.component.scss']
})
export class CreateChampionshipComponent {
  campeonato: CampeonatoForm = {
    nombre: '',
    fechaInicio: '',
    fechaFin: '',
    ubicacion: '',
    alcance: 'Regional',
    numTatamis: 1
  };

  alcanceOptions = ['Regional', 'Nacional', 'Binacional', 'Internacional'];
  cinturones = [
    { value: 'Blanco', label: 'Blanco' },
    { value: 'Amarillo', label: 'Amarillo' },
    { value: 'Naranja', label: 'Naranja' },
    { value: 'Naranja/verde', label: 'Naranja/verde' },
    { value: 'Verde', label: 'Verde' },
    { value: 'Verde/azul', label: 'Verde/azul' },
    { value: 'Azul', label: 'Azul' },
    { value: 'Rojo', label: 'Rojo' },
    { value: 'Marrón', label: 'Marrón' },
    { value: 'Marrón/negro', label: 'Marrón/negro' },
    { value: 'Negro', label: 'Negro' }
  ];

  // Orden de cinturones para validación (menor a mayor)
  cinturonOrder: { [key: string]: number } = {
    'Blanco': 0,
    'Amarillo': 1,
    'Naranja': 2,
    'Naranja/verde': 3,
    'Verde': 4,
    'Verde/azul': 5,
    'Azul': 6,
    'Rojo': 7,
    'Marrón': 8,
    'Marrón/negro': 9,
    'Negro': 10
  };
  minDate = this.getTodayDate();

  modalidades: ModalidadConfig[] = [
    {
      id: 'combates',
      nombre: 'Combates',
      activa: true,
      expanded: true,
      categorias: {
        cinturon: [],
        edad: [],
        peso: [],
        genero: null
      }
    },
    {
      id: 'figura-armas',
      nombre: 'Figura con armas',
      activa: true,
      expanded: false,
      categorias: {
        cinturon: [],
        edad: [],
        peso: [],
        genero: null
      }
    },
    {
      id: 'figura-manos',
      nombre: 'Figura a manos libres',
      activa: true,
      expanded: false,
      categorias: {
        cinturon: [],
        edad: [],
        peso: [],
        genero: null
      }
    },
    {
      id: 'defensa-personal',
      nombre: 'Defensa personal',
      activa: true,
      expanded: false,
      categorias: {
        cinturon: [],
        edad: [],
        peso: [],
        genero: null
      }
    }
  ];

  tatamisExpanded = false;
  saving = false;
  message: string | null = null;
  success = false;
  categoryError: { [key: string]: string } = {};

  constructor(private location: Location, private router: Router) {}

  getTodayDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  onDocumentoInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const soloNumeros = (target.value || '').replace(/\D+/g, '').slice(0, 2);
    target.value = soloNumeros;
    this.campeonato.numTatamis = parseInt(soloNumeros, 10) || 0;
  }

  limitarTatamis() {
    if (this.campeonato.numTatamis > 12) {
      this.campeonato.numTatamis = 12;
    }
    if (this.campeonato.numTatamis < 1) {
      this.campeonato.numTatamis = 1;
    }
  }

  limitarEdad(event: Event) {
    const target = event.target as HTMLInputElement;
    let valor = (target.value || '').replace(/\D+/g, '');
    if (valor && parseInt(valor, 10) > 100) {
      valor = '100';
    }
    target.value = valor;
  }

  limitarPeso(event: Event) {
    const target = event.target as HTMLInputElement;
    let valor = (target.value || '').replace(/\D+/g, '');
    if (valor.length > 3) {
      valor = valor.slice(0, 3);
    }
    // Validar que no supere 400
    if (valor && parseInt(valor, 10) > 400) {
      valor = '400';
    }
    target.value = valor;
  }


  toggleModalidad(id: string): void {
    this.modalidades = this.modalidades.map(mod => mod.id === id ? { ...mod, expanded: !mod.expanded } : mod);
  }

  setCategoriaType(mod: ModalidadConfig, categoryKey: 'cinturon' | 'edad' | 'peso', type: 'individual' | 'rango'): void {
    const categories = mod.categorias[categoryKey];
    if (categories) {
      mod.categorias[categoryKey] = categories.map(cat => ({ ...cat, tipo: type }));
    }
  }

  addCategoryItem(mod: ModalidadConfig, categoryKey: 'cinturon' | 'edad' | 'peso', tipo?: 'individual' | 'rango'): void {
    const categories = mod.categorias[categoryKey];
    if (!categories) return;

    const errorKey = `${mod.id}-${categoryKey}`;
    delete this.categoryError[errorKey];

    // Si hay un último item vacío, sobreescribirlo con el nuevo tipo
    if (categories.length > 0) {
      const lastItem = categories[categories.length - 1];
      const isLastEmpty = !lastItem.valor && !lastItem.desde && !lastItem.hasta;

      if (isLastEmpty && tipo) {
        // Sobreescribir el tipo del último item vacío
        lastItem.tipo = tipo;
        if (tipo === 'individual') {
          lastItem.valor = '';
          lastItem.desde = undefined;
          lastItem.hasta = undefined;
        } else {
          lastItem.valor = undefined;
          lastItem.desde = '';
          lastItem.hasta = '';
        }
        return;
      }
    }

    // Validar items incompletos
    const itemsIncompletos = categories.filter(cat => {
      if (cat.tipo === 'individual') {
        return !cat.valor || (cat.valor || '').toString().trim() === '';
      } else {
        return !cat.desde || !cat.hasta ||
               (cat.desde || '').toString().trim() === '' ||
               (cat.hasta || '').toString().trim() === '';
      }
    });

    if (itemsIncompletos.length > 0) {
      this.categoryError[errorKey] = 'Completa todos los campos antes de agregar otro.';
      return;
    }

    // Validar que en rangos el valor desde no sea igual al hasta
    const rangosIguales = categories.some(cat => {
      if (cat.tipo === 'rango' && cat.desde && cat.hasta) {
        if (categoryKey === 'cinturon') {
          return cat.desde === cat.hasta;
        } else {
          const desde = (cat.desde || '').toString().trim();
          const hasta = (cat.hasta || '').toString().trim();
          return desde === hasta;
        }
      }
      return false;
    });

    if (rangosIguales) {
      this.categoryError[errorKey] = `El rango "desde" y "hasta" no pueden ser iguales.`;
      return;
    }

    // Validar rangos (desde < hasta)
    const rangosInvalidos = categories.some(cat => {
      if (cat.tipo === 'rango' && cat.desde && cat.hasta) {
        if (categoryKey === 'cinturon') {
          const desdeOrder = this.cinturonOrder[cat.desde];
          const hastaOrder = this.cinturonOrder[cat.hasta];
          return desdeOrder >= hastaOrder;
        } else {
          const desde = this.parseValue(categoryKey, cat.desde);
          const hasta = this.parseValue(categoryKey, cat.hasta);
          return desde >= hasta;
        }
      }
      return false;
    });

    if (rangosInvalidos) {
      this.categoryError[errorKey] = 'El valor "desde" debe ser menor que "hasta".';
      return;
    }

    // Validar solapamiento completo
    const solapamiento = this.validarSolapamiento(categories, categoryKey);
    if (solapamiento) {
      this.categoryError[errorKey] = solapamiento;
      return;
    }

    // Agregar nueva categoría
    const tipoFinal = tipo || 'individual';
    const newCategory: CategoriaConfig = {
      nombre: '',
      activa: true,
      tipo: tipoFinal,
      valor: tipoFinal === 'individual' ? '' : undefined,
      desde: tipoFinal === 'rango' ? '' : undefined,
      hasta: tipoFinal === 'rango' ? '' : undefined
    };
    categories.push(newCategory);
  }

  validarSolapamiento(categories: CategoriaConfig[], categoryKey: 'cinturon' | 'edad' | 'peso'): string | null {
    // Validación para cinturón
    if (categoryKey === 'cinturon') {
      const individuales = categories
        .filter(cat => cat.tipo === 'individual' && cat.valor)
        .map(cat => (cat.valor || '').toString().trim());

      const rangos = categories
        .filter(cat => cat.tipo === 'rango' && cat.desde && cat.hasta)
        .map(cat => ({
          desde: (cat.desde || '').toString().trim(),
          hasta: (cat.hasta || '').toString().trim()
        }));

      // Verificar duplicados individuales
      const duplicados = individuales.filter((item, index) => individuales.indexOf(item) !== index);
      if (duplicados.length > 0) {
        return `Cinturón duplicado: ${duplicados[0]}`;
      }

      // Verificar si un individual está dentro de un rango
      for (const ind of individuales) {
        const indOrder = this.cinturonOrder[ind];
        for (const rango of rangos) {
          const desdeOrder = this.cinturonOrder[rango.desde];
          const hastaOrder = this.cinturonOrder[rango.hasta];
          if (indOrder >= desdeOrder && indOrder <= hastaOrder) {
            return `El cinturón "${ind}" ya está incluido en el rango "${rango.desde} a ${rango.hasta}".`;
          }
        }
      }

      // Verificar solapamiento entre rangos
      for (let i = 0; i < rangos.length; i++) {
        for (let j = i + 1; j < rangos.length; j++) {
          const r1Desde = this.cinturonOrder[rangos[i].desde];
          const r1Hasta = this.cinturonOrder[rangos[i].hasta];
          const r2Desde = this.cinturonOrder[rangos[j].desde];
          const r2Hasta = this.cinturonOrder[rangos[j].hasta];

          if ((r1Desde <= r2Hasta && r1Hasta >= r2Desde)) {
            return `Los rangos "${rangos[i].desde} a ${rangos[i].hasta}" y "${rangos[j].desde} a ${rangos[j].hasta}" se solapan.`;
          }
        }
      }
    }
    // Validación para edad y peso (numéricos)
    else if (categoryKey === 'edad' || categoryKey === 'peso') {
      const individuales = categories
        .filter(cat => cat.tipo === 'individual' && cat.valor)
        .map(cat => this.parseValue(categoryKey, cat.valor!));

      const rangos = categories
        .filter(cat => cat.tipo === 'rango' && cat.desde && cat.hasta)
        .map(cat => ({
          desde: this.parseValue(categoryKey, cat.desde!),
          hasta: this.parseValue(categoryKey, cat.hasta!),
          desdeStr: (cat.desde || '').toString(),
          hastaStr: (cat.hasta || '').toString()
        }));

      // Verificar duplicados individuales
      const duplicados = individuales.filter((item, index) => individuales.indexOf(item) !== index);
      if (duplicados.length > 0) {
        const unidad = categoryKey === 'edad' ? 'años' : 'kg';
        return `Valor duplicado: ${duplicados[0]} ${unidad}`;
      }

      // Verificar si un individual está dentro de un rango
      for (const ind of individuales) {
        for (const rango of rangos) {
          if (ind >= rango.desde && ind <= rango.hasta) {
            const unidad = categoryKey === 'edad' ? 'años' : 'kg';
            return `El valor "${ind} ${unidad}" ya está incluido en el rango "${rango.desdeStr} a ${rango.hastaStr}".`;
          }
        }
      }

      // Verificar solapamiento entre rangos
      for (let i = 0; i < rangos.length; i++) {
        for (let j = i + 1; j < rangos.length; j++) {
          const r1 = rangos[i];
          const r2 = rangos[j];
          if ((r1.desde <= r2.hasta && r1.hasta >= r2.desde)) {
            return `Los rangos "${r1.desdeStr} a ${r1.hastaStr}" y "${r2.desdeStr} a ${r2.hastaStr}" se solapan.`;
          }
        }
      }
    }

    return null;
  }

  parseValue(categoryKey: string, value: any): number {
    if (categoryKey === 'edad' || categoryKey === 'peso') {
      return parseInt(value, 10) || 0;
    }
    return 0;
  }

  removeCategoryItem(mod: ModalidadConfig, categoryKey: 'cinturon' | 'edad' | 'peso', index: number): void {
    const categories = mod.categorias[categoryKey];
    if (categories) {
      categories.splice(index, 1);
      if (categories.length === 0) {
        // Si no quedan categorías, limpiar el array
        mod.categorias[categoryKey] = [];
      }
    }
  }

  onSubmit(): void {
    this.message = null;
    this.success = false;

    if (!this.campeonato.nombre.trim() || !this.campeonato.fechaInicio || !this.campeonato.fechaFin || !this.campeonato.ubicacion.trim()) {
      this.message = 'Completa los campos obligatorios marcados con *.';
      return;
    }

    const payload = {
      ...this.campeonato,
      modalidades: this.modalidades.map(({ expanded, ...rest }) => rest)
    };

    // TODO: Reemplazar por llamada real a la API cuando esté disponible.
    this.saving = true;
    setTimeout(() => {
      this.saving = false;
      this.success = true;
      this.message = 'Campeonato guardado como borrador. Pronto se conectará con el backend.';
      // console.log('Payload de campeonato', payload);
    }, 400);
  }

  goBack(): void {
    this.location.back();
  }
}
