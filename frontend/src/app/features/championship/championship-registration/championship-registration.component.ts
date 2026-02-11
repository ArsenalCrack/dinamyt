import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { delay } from 'rxjs/operators';
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
    loadingMessage = 'Cargando información del torneo...';
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

    registeredModalities: string[] = [];

    // ...

    loadChampionship(): void {
        this.loading = true;
        this.api.getCampeonatoById(this.id!).subscribe({
            next: (data) => {
                this.campeonato = data;
                if (data.modalidades) {
                    try {
                        const parsed = typeof data.modalidades === 'string' ? JSON.parse(data.modalidades) : data.modalidades;
                        if (Array.isArray(parsed)) {
                            this.fullModalities = parsed;
                            // Check existing inscriptions before filtering
                            this.loadExistingInscriptions();
                        } else {
                            throw new Error('Modalidades is not an array');
                        }
                    } catch (e) {
                        console.error('Error parsing modalidades', e);
                        this.fallbackModalities();
                        this.loading = false;
                    }
                } else {
                    this.fallbackModalities();
                    this.loading = false;
                }
            },
            error: () => {
                this.fallbackModalities();
                this.loading = false;
            }
        });
    }

    showReInscriptionWarning = false;

    loadExistingInscriptions(): void {
        if (!this.currentUser.id) {
            this.filterAvailableModalities();
            this.loading = false;
            return;
        }

        this.api.getMisInscripciones(this.currentUser.id).subscribe({
            next: (data: any[]) => {
                console.log('Mis Inscripciones raw:', data);
                const currentChampInscriptions = data.filter(i => {
                    // Check all possible locations of championship ID
                    const iCampId = i.campeonato?.idCampeonato || i.campeonatoId || i.campeonato;
                    return iCampId == this.id;
                });

                console.log('Inscriptions for this championship:', currentChampInscriptions);

                console.log('Inscriptions for this championship:', currentChampInscriptions);

                // Any existing inscription triggers the warning/modal
                if (currentChampInscriptions.length > 0) {
                    this.showReInscriptionWarning = true;
                }

                this.registeredModalities = [];
                currentChampInscriptions.forEach(ins => {
                    if (ins.seccionesDetalles) {
                        ins.seccionesDetalles.forEach((sec: any) => {
                            if (sec.MODALIDAD) this.registeredModalities.push(sec.MODALIDAD);
                            if (sec.modalidad) this.registeredModalities.push(sec.modalidad); // fallback
                        });
                    } else if (ins.secciones) {
                        // Fallback parsing if backend returns raw string string
                        // Note: backend might return processed object if using DTO, but here we use raw entity endpoint?
                        // Actually getMisInscripciones in ApiService might be using the raw endpoint.
                        // Let's also check if secciones is array or string
                        try {
                            let parsed = typeof ins.secciones === 'string' ? JSON.parse(ins.secciones) : ins.secciones;
                            if (Array.isArray(parsed)) {
                                parsed.forEach((s: any) => {
                                    if (s.MODALIDAD) this.registeredModalities.push(s.MODALIDAD);
                                    else if (typeof s === 'string' && s.includes('-')) this.registeredModalities.push(s.split('-')[0].trim());
                                });
                            }
                        } catch (e) { }
                    }
                });

                this.filterAvailableModalities();
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading existing inscriptions', err);
                this.filterAvailableModalities(); // Continue anyway
                this.loading = false;
            }
        });
    }

    unavailableMessage: string = '';

    filterAvailableModalities(): void {
        const userBelt = this.currentUser.cinturon;
        const targetDate = this.campeonato?.fechaInicio;
        const userAge = this.getAge(this.currentUser.fechaNacimiento, targetDate);
        const userGender = this.currentUser.sexo;

        let alreadyRegisteredCount = 0;
        let ageMismatchCount = 0;
        let beltMismatchCount = 0;
        let genderMismatchCount = 0;
        let totalCount = this.fullModalities.length;

        const validIds = this.fullModalities.filter(mod => {
            const modName = mod.nombre || mod.id;

            // Filter out already registered modalities
            if (this.registeredModalities.includes(modName)) {
                alreadyRegisteredCount++;
                return false;
            }

            let matchesRequirement = true;

            // Check Age Requirements
            if (mod.categorias && mod.categorias.edad && mod.categorias.edad.length > 0) {
                if (userAge === null || isNaN(userAge)) {
                    ageMismatchCount++;
                    matchesRequirement = false;
                } else {
                    const matchesAnyAge = mod.categorias.edad.some((cat: any) => this.matchesAge(cat, userAge));
                    if (!matchesAnyAge) {
                        ageMismatchCount++;
                        matchesRequirement = false;
                    }
                }
            }

            // Check Belt Requirements
            if (matchesRequirement && mod.categorias && mod.categorias.cinturon && mod.categorias.cinturon.length > 0) {
                if (userBelt && userBelt !== 'null') {
                    const matchesAnyBelt = mod.categorias.cinturon.some((cat: any) => this.matchesBelt(cat, userBelt));
                    if (!matchesAnyBelt) {
                        beltMismatchCount++;
                        matchesRequirement = false;
                    }
                }
            }

            // Check Gender Requirements
            if (matchesRequirement && mod.categorias && mod.categorias.genero === 'individual') {
                if (!userGender) {
                    genderMismatchCount++;
                    matchesRequirement = false;
                }
            }

            return matchesRequirement;
        }).map(m => m.nombre || m.id);

        this.modalidadOptions = this.fullModalities
            .filter(m => validIds.includes(m.nombre || m.id))
            .map((m: any) => ({
                value: m.nombre || m.id,
                label: m.nombre
            }));

        this.noModalitiesAvailable = this.modalidadOptions.length === 0;

        if (this.noModalitiesAvailable) {
            if (alreadyRegisteredCount === totalCount) {
                this.unavailableMessage = "Ya estás inscrito en todas las modalidades disponibles de este campeonato.";
            } else if (alreadyRegisteredCount > 0) {
                this.unavailableMessage = "Ya estás inscrito en algunas modalidades y no cumples los requisitos para las restantes.";
            } else {
                // Not registered in any, but all filtered
                if (ageMismatchCount > 0 && beltMismatchCount === 0 && genderMismatchCount === 0) {
                    this.unavailableMessage = "Tu edad no cumple con los requisitos de ninguna categoría disponible.";
                } else if (beltMismatchCount > 0 && ageMismatchCount === 0 && genderMismatchCount === 0) {
                    this.unavailableMessage = "Tu rango de cinturón no cumple con los requisitos de ninguna categoría disponible.";
                } else if (genderMismatchCount > 0) {
                    this.unavailableMessage = "Falta información de género en tu perfil para verificar requisitos.";
                } else {
                    this.unavailableMessage = "No cumples con los requisitos (Edad, Cinturón o Género) para las modalidades de este campeonato.";
                }
            }
        }
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

    showConfirmModal = false;

    // Triggered by form submit
    initiateRegistration(): void {
        if (this.isFieldRequired('peso')) {
            if (!this.registrationData.peso) {
                this.weightError = 'El peso es obligatorio';
                return;
            }
            const weightVal = parseInt(this.registrationData.peso, 10);
            if (isNaN(weightVal) || weightVal < 10) {
                this.weightError = 'Peso inválido';
                return;
            }
            if (!this.checkWeightMatch(weightVal)) {
                this.weightError = 'Tu peso no cumple con los requisitos de las modalidades seleccionadas.';
                return;
            }
        }

        if (this.isFieldRequired('cinturon') && !this.currentUser.cinturon) {
            this.message = 'Se requiere cinturón en tu perfil.';
            this.success = false;
            return;
        }

        // Logic check: "no quiero que aparezca la cajita, si es la primera vez que se inscribe"
        // Meaning: Only show confirmation modal if we need to show the ReInscription warning.
        // Otherwise, proceed directly.
        if (this.showReInscriptionWarning) {
            this.showConfirmModal = true;
            this.scrollLock.lock();
        } else {
            this.confirmRegistration();
        }
    }

    cancelConfirmation(): void {
        this.showConfirmModal = false;
        this.scrollLock.unlock();
    }

    // Actual API call
    confirmRegistration(): void {
        this.showConfirmModal = false;
        this.submitting = true;
        this.message = null;

        const payload: any = {
            idUsuario: this.currentUser.id,
            campeonatoId: this.id,
            codigo: this.code,
            modalidades: this.registrationData.modalidades,
        };

        if (this.isFieldRequired('cinturon')) {
            payload.cinturon = this.currentUser.cinturon;
        }

        if (this.isFieldRequired('peso')) {
            payload.peso = this.registrationData.peso;
        }

        const checkReq = (field: string) => this.registrationData.modalidades.some(m => this.checkModalityRequirement(m, field));

        if (checkReq('genero') || checkReq('sexo')) {
            payload.genero = this.currentUser.sexo;
        }

        if (checkReq('edad') || checkReq('fechaNacimiento')) {
            const targetDate = this.campeonato?.fechaInicio;
            const ageAtEvent = this.getAge(this.currentUser.fechaNacimiento, targetDate);

            if (ageAtEvent !== null) {
                payload.edad = ageAtEvent;
            }
        }

        this.loadingMessage = 'Procesando inscripción...';
        this.loading = true;
        // Scroll lock is already on or we ensure it
        this.scrollLock.lock();

        this.api.inscribirUsuarioCampeonato(payload)
            .pipe(delay(2000))
            .subscribe({
                next: (res) => {
                    this.success = true;
                    this.message = 'Inscripción realizada exitosamente.';
                    this.showToast('La Inscripción se ha realizado con éxito'); // Show toast

                    setTimeout(() => {
                        this.loading = false;
                        this.scrollLock.unlock(); // Ensure unlock happens before navigation
                        this.router.navigate(['/campeonatos']);
                    }, 2000); // Wait for toast
                },
                error: (err) => {
                    console.error('Error inscribiendo usuario', err);
                    this.success = false;
                    this.message = err.error.message || 'Hubo un error al realizar la inscripción.';
                    this.submitting = false;
                    this.loading = false;
                    this.scrollLock.unlock();
                }
            });
    }

    // Toast Logic
    toastVisible = false;
    toastMessage = '';

    showToast(msg: string): void {
        this.toastMessage = msg;
        this.toastVisible = true;
        setTimeout(() => {
            this.toastVisible = false;
        }, 3000);
    }

    goBack(): void {
        this.scrollLock.unlock(); // Safety unlock
        this.backNav.backOr({ fallbackUrl: '/campeonatos' });
    }

    ngOnDestroy(): void {
        this.scrollLock.unlock();
    }
}
