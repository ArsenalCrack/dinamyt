import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

@Component({
    selector: 'app-championship-registration',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, LoadingSpinnerComponent, CustomSelectComponent],
    templateUrl: './championship-registration.component.html',
    styleUrls: ['./championship-registration.component.scss']
})
export class ChampionshipRegistrationComponent implements OnInit {
    id: string | null = null;
    code: string = '';
    campeonato: any = null;
    loading = true;
    submitting = false;
    message: string | null = null;
    success = false;

    // Simplified form data
    registrationData: { peso: string; modalidades: string[] } = {
        peso: '',
        modalidades: []
    };

    currentUser: any = {};

    fullModalities: any[] = [];
    modalidadOptions: any[] = [];

    // Validations
    weightError: string | null = null;
    beltError: string | null = null;

    showProfileAlert = false;
    noModalitiesAvailable = false;

    // Ordered belts for range comparison
    private cinturonOrder: { [key: string]: number } = {
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

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private api: ApiService,
        private backNav: BackNavigationService,
        private scrollLock: ScrollLockService
    ) { }

    ngOnInit(): void {
        this.loadUserFromSession();
        this.id = this.route.snapshot.paramMap.get('id');
        this.code = this.route.snapshot.queryParamMap.get('code') || '';

        if (this.id) {
            this.loadChampionship();
        } else {
            this.router.navigate(['/campeonatos']);
        }
    }

    loadUserFromSession() {
        this.currentUser = {
            id: sessionStorage.getItem('idDocumento'),
            nombre: sessionStorage.getItem('nombreC'),
            cinturon: sessionStorage.getItem('cinturon_rango') || sessionStorage.getItem('cinturonRango'),
            sexo: sessionStorage.getItem('sexo'),
            fechaNacimiento: sessionStorage.getItem('fechaNacimiento')
        };
    }

    getAge(birthdateStr: string, targetDateStr?: string): number | null {
        if (!birthdateStr) return null;

        const parse = (d: string | Date) => {
            if (d instanceof Date) return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
            // Assume string YYYY-MM-DD or similar
            const str = String(d).split('T')[0];
            const parts = str.split('-');
            if (parts.length === 3) {
                // Ensure decimal parsing
                return { y: parseInt(parts[0], 10), m: parseInt(parts[1], 10) - 1, d: parseInt(parts[2], 10) };
            }
            const dob = new Date(d);
            return { y: dob.getFullYear(), m: dob.getMonth(), d: dob.getDate() };
        };

        const dob = parse(birthdateStr);
        // target defaults to today
        let target = { y: new Date().getFullYear(), m: new Date().getMonth(), d: new Date().getDate() };

        if (targetDateStr) {
            target = parse(targetDateStr);
        }

        let age = target.y - dob.y;
        if (target.m < dob.m || (target.m === dob.m && target.d < dob.d)) {
            age--;
        }
        return age;
    }

    loadChampionship(): void {
        this.loading = true;
        this.api.getCampeonatoById(this.id!).subscribe({
            next: (data) => {
                this.campeonato = data;
                // Map modalities from campeonato if available
                if (data.modalidades) {
                    try {
                        const parsed = typeof data.modalidades === 'string' ? JSON.parse(data.modalidades) : data.modalidades;
                        if (Array.isArray(parsed)) {
                            this.fullModalities = parsed;
                            this.filterAvailableModalities();
                        } else {
                            // Fallback if not an array
                            throw new Error('Modalidades is not an array');
                        }
                    } catch (e) {
                        console.error('Error parsing modalidades', e);
                        this.fallbackModalities();
                    }
                } else {
                    this.fallbackModalities();
                }
                this.loading = false;
            },
            error: () => {
                // Mock for demo
                this.campeonato = {
                    nombre: 'Gran Torneo de Verano 2026',
                    ubicacion: 'Coliseo El Campín, Bogotá'
                };
                this.fallbackModalities();
                this.loading = false;
            }
        });
    }

    filterAvailableModalities(): void {
        const userBelt = this.currentUser.cinturon;
        // Age calculation relative to Championship Start Date
        const targetDate = this.campeonato?.fechaInicio;
        const userAge = this.getAge(this.currentUser.fechaNacimiento, targetDate);
        const userGender = this.currentUser.sexo;

        // Filter logic: Only keep modalities where the user fits the requirements
        const validIds = this.fullModalities.filter(mod => {
            // Check Age Requirements (Strict: if missing age, hide)
            if (mod.categorias && mod.categorias.edad && mod.categorias.edad.length > 0) {
                if (userAge === null || isNaN(userAge)) return false; // Missing age -> Hide
                const matchesAnyAge = mod.categorias.edad.some((cat: any) => this.matchesAge(cat, userAge));
                if (!matchesAnyAge) return false; // Mismatch age -> Hide
            }

            // Check Belt Requirements - STRICT FILTERING IF DATA EXISTS
            if (mod.categorias && mod.categorias.cinturon && mod.categorias.cinturon.length > 0) {
                // Only hide if user HAS a belt but it doesn't match available options
                // If user has NO belt, we show it so they can click and get the "Profile Incomplete" alert
                if (userBelt && userBelt !== 'null') {
                    const matchesAnyBelt = mod.categorias.cinturon.some((cat: any) => this.matchesBelt(cat, userBelt));
                    if (!matchesAnyBelt) return false;
                }
            }

            // Check Gender Requirements
            if (mod.categorias && mod.categorias.genero === 'individual') {
                if (!userGender) return false;
            }

            return true;
        }).map(m => m.nombre || m.id);

        this.modalidadOptions = this.fullModalities
            .filter(m => validIds.includes(m.nombre || m.id))
            .map((m: any) => ({
                value: m.nombre || m.id,
                label: m.nombre
            }));

        this.noModalitiesAvailable = this.modalidadOptions.length === 0;
    }

    matchesBelt(category: any, userBelt: string): boolean {
        if (!userBelt) return false;
        if (category.tipo === 'individual') {
            return category.valor === userBelt;
        } else if (category.tipo === 'rango') {
            const min = this.cinturonOrder[category.desde];
            const max = this.cinturonOrder[category.hasta];
            const current = this.cinturonOrder[userBelt];
            if (min === undefined || max === undefined || current === undefined) return false;
            return current >= min && current <= max;
        }
        return false;
    }

    matchesAge(category: any, userAge: number): boolean {
        if (category.tipo === 'individual') {
            return Number(category.valor) === userAge;
        } else if (category.tipo === 'rango') {
            const min = Number(category.desde);
            const max = Number(category.hasta);
            return userAge >= min && userAge <= max;
        }
        return false;
    }

    fallbackModalities() {
        this.modalidadOptions = [
            { value: 'Combates', label: 'Combates' },
            { value: 'Figura', label: 'Figura' }
        ];
        // Mock full structure for fallback
        this.fullModalities = [
            { nombre: 'Combates', categorias: { cinturon: [], peso: [] } },
            { nombre: 'Figura', categorias: { cinturon: [], peso: [] } }
        ];
        this.noModalitiesAvailable = false;
    }

    toggleModalidad(val: string): void {
        const index = this.registrationData.modalidades.indexOf(val);
        if (index > -1) {
            this.registrationData.modalidades.splice(index, 1);
        } else {
            // Check if modality requires belt and if user has it
            if (this.checkModalityRequirement(val, 'cinturon')) {
                if (!this.currentUser.cinturon || this.currentUser.cinturon === 'null') {
                    // Show custom Alert Logic instead of setting this.message
                    this.showProfileAlert = true;
                    this.scrollLock.lock();
                    this.success = false;
                    return; // Don't add
                }
            }
            this.registrationData.modalidades.push(val);
            this.message = null;
        }

        // Reset weight if not required
        if (!this.isFieldRequired('peso')) this.registrationData.peso = '';
        this.weightError = null;
    }

    closeProfileAlert(): void {
        this.showProfileAlert = false;
        this.scrollLock.unlock();
    }

    goToProfile(): void {
        this.showProfileAlert = false;
        this.scrollLock.unlock();
        this.router.navigate(['/perfil']);
    }

    checkModalityRequirement(modName: string, field: string): boolean {
        const modConfig = this.fullModalities.find(m => (m.nombre || m.id) === modName);
        if (!modConfig || !modConfig.categorias) return false;
        const categoryConfig = modConfig.categorias[field];
        return Array.isArray(categoryConfig) && categoryConfig.length > 0;
    }

    isModalidadSelected(val: string): boolean {
        return this.registrationData.modalidades.includes(val);
    }

    isFieldRequired(field: 'cinturon' | 'peso'): boolean {
        // Find if any selected modality has configuration for this field
        return this.registrationData.modalidades.some(modName => {
            return this.checkModalityRequirement(modName, field);
        });
    }

    checkWeightMatch(weight: number): boolean {
        const activeModalities = this.fullModalities.filter(m => this.isModalidadSelected(m.nombre || m.id));
        const weightModalities = activeModalities.filter(m => m.categorias && m.categorias.peso && m.categorias.peso.length > 0);

        if (weightModalities.length === 0) return true;

        // Weight must be valid for ALL selected modalities that care about weight
        return weightModalities.every(mod => {
            return mod.categorias.peso.some((cat: any) => this.matchesWeight(cat, weight));
        });
    }

    matchesWeight(category: any, weight: number): boolean {
        if (category.tipo === 'individual') {
            return Number(category.valor) === weight;
        } else if (category.tipo === 'rango') {
            const min = Number(category.desde);
            const max = Number(category.hasta);
            return weight >= min && weight <= max;
        }
        return false;
    }

    validateWeight(event: Event): void {
        const input = event.target as HTMLInputElement;
        let val = input.value.replace(/\D/g, ''); // Remove non-digits

        if (val.length > 3) {
            val = val.slice(0, 3);
        }

        input.value = val;
        this.registrationData.peso = val;

        if (!val && this.isFieldRequired('peso')) {
            this.weightError = 'El peso es obligatorio';
        } else if (val && parseInt(val) < 10) {
            this.weightError = 'Peso mínimo 10kg';
        } else {
            // Check if weight matches any category range for selected modalities
            const validWeight = this.checkWeightMatch(parseInt(val));
            if (!validWeight) {
                this.weightError = 'Tu peso no entra en ninguna categoría disponible.';
            } else {
                this.weightError = null;
            }
        }
    }

    submitRegistration(): void {
        if (this.isFieldRequired('peso')) {
            if (!this.registrationData.peso) {
                this.weightError = 'El peso es obligatorio';
                return;
            }
            // Strict re-validation on submit
            const weightVal = parseInt(this.registrationData.peso, 10);
            if (isNaN(weightVal) || weightVal < 10) {
                this.weightError = 'Peso inválido';
                return;
            }
            if (!this.checkWeightMatch(weightVal)) {
                this.weightError = 'Tu peso no cumple con los requisitos de las modalidades seleccionadas.';
                // Stop submission
                return;
            }
        }

        /* Belt check is done at selection time, but double check here */
        if (this.isFieldRequired('cinturon') && !this.currentUser.cinturon) {
            this.message = 'Se requiere cinturón en tu perfil.';
            this.success = false;
            return;
        }

        this.submitting = true;
        this.message = null;

        const payload: any = {
            idUsuario: this.currentUser.id, // ID User
            campeonatoId: this.id,          // ID Championship
            codigo: this.code,
            modalidades: this.registrationData.modalidades,
        };

        // Belt
        if (this.isFieldRequired('cinturon')) {
            payload.cinturon = this.currentUser.cinturon;
        }

        // Weight
        if (this.isFieldRequired('peso')) {
            payload.peso = this.registrationData.peso;
        }

        const checkReq = (field: string) => this.registrationData.modalidades.some(m => this.checkModalityRequirement(m, field));

        if (checkReq('genero') || checkReq('sexo')) {
            payload.genero = this.currentUser.sexo;
        }

        // Calculate Age at Championship Date
        if (checkReq('edad') || checkReq('fechaNacimiento')) {
            // Calculate age on the day of the championship
            const targetDate = this.campeonato?.fechaInicio;
            const ageAtEvent = this.getAge(this.currentUser.fechaNacimiento, targetDate);

            if (ageAtEvent !== null) {
                payload.edad = ageAtEvent;
            }
        }

        console.log('Submitting payload:', payload);

        // Simulated API call
        setTimeout(() => {
            this.success = true;
            this.message = 'Inscripción realizada exitosamente.';
            this.submitting = false;
            setTimeout(() => {
                this.router.navigate(['/campeonatos']);
            }, 2000);
        }, 1500);
    }

    goBack(): void {
        this.backNav.backOr({ fallbackUrl: '/campeonatos' });
    }
}
