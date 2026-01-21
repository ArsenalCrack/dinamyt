import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { delayRemaining } from '../../../core/utils/spinner-timing.util';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { extractUserRoles } from '../../../core/utils/user-type.util';

interface AcademyData {
    nombre: string;
    direccion: string;
    telefono: string;
    url: string;
    descripcion: string;
}

interface InstructorOption {
    id: number | string;
    nombre: string;
    documento: string;
    email: string;
    cargo?: string;
}

@Component({
    selector: 'app-my-academy',
    standalone: true,
    imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
    templateUrl: './my-academy.component.html',
    styleUrls: ['./my-academy.component.scss']
})
export class MyAcademyComponent implements OnInit {
    saving = false;
    message: string | null = null;
    success = false;
    loading = true;

    // Roles
    userType: number = 1; // 1=User, 2=Instructor, 4=Owner
    isOwner = false;
    isInstructor = false;

    // Tabs
    activeTab: 'dashboard' | 'info' | 'instructors' | 'students' = 'dashboard';

    // State
    hasAcademy = false;
    logoUrl: string | null = null;
    logoPreview: string | ArrayBuffer | null = null;

    academy: AcademyData = {
        nombre: '',
        direccion: '',
        telefono: '',
        url: '',
        descripcion: ''
    };

    // Lists
    instructors: any[] = [];
    students: any[] = [];

    // Form for adding (Legacy)
    newEmail: string = '';

    // Constraints & Validation
    private readonly MAX_NAME_LEN = 100;
    private readonly MAX_ADDR_LEN = 150;
    private readonly MAX_PHONE_LEN = 20;
    private readonly MAX_URL_LEN = 200;
    private readonly MAX_DESC_LEN = 300;

    nombreLimitMsg = '';
    direccionLimitMsg = '';
    telefonoLimitMsg = '';
    urlLimitMsg = '';
    descripcionLimitMsg = '';

    // Instructor Autocomplete
    instructorSearchText = '';
    instructorIsOpen = false;
    instructorFocusedIndex = -1;
    instructorFilteredOptions: InstructorOption[] = [];

    // Mocking available instructors for the search
    allAvailableInstructors: InstructorOption[] = [
        { id: 201, nombre: 'Alberto Rojas', documento: '123456', email: 'alberto@test.com', cargo: 'Instructor' },
        { id: 202, nombre: 'Beatriz Soler', documento: '234567', email: 'beatriz@test.com', cargo: 'Poomsae' },
        { id: 203, nombre: 'Carlos Mario', documento: '345678', email: 'carlos@test.com', cargo: 'Sparring' },
        { id: 204, nombre: 'Diana Prince', documento: '456789', email: 'diana@test.com', cargo: 'Coach' },
        { id: 205, nombre: 'Eduardo Galeano', documento: '567890', email: 'eduardo@test.com', cargo: 'Sensei' },
    ];


    constructor(
        private location: Location,
        private backNav: BackNavigationService
    ) { }

    ngOnInit(): void {
        this.loadUserRole();
        this.loadAcademyData();
    }

    private loadUserRole(): void {
        const rawUsuario = localStorage.getItem('usuario');
        if (rawUsuario) {
            try {
                const parsed = JSON.parse(rawUsuario);
                const user = parsed.usuario || parsed;
                const roles = extractUserRoles(user);

                if (roles.includes('dueño')) {
                    this.userType = 4;
                } else if (roles.includes('instructor')) {
                    this.userType = 2;
                } else if (roles.includes('administrador') || roles.includes('admin_proyecto')) {
                    this.userType = 3;
                } else {
                    this.userType = 1;
                }

                this.isOwner = this.userType === 4;
                this.isInstructor = this.userType === 2;

                // If dashboard is the default and user is instructor, maybe they prefer 'info' or 'students'
                if (this.isInstructor && this.activeTab === 'dashboard') {
                    this.activeTab = 'info';
                }
            } catch (e) {
                console.error('Error detection user role in MyAcademy:', e);
            }
        }
    }

    private loadAcademyData(): void {
        this.loading = true;
        // Simular carga de API
        setTimeout(() => {
            const saved = localStorage.getItem('my_academy_data');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    this.academy = { ...this.academy, ...parsed };
                    this.hasAcademy = true;
                } catch { }
            } else if (this.isInstructor) {
                // Si es instructor pero no es el dueño, simulamos que está en una academia
                this.hasAcademy = true;
                this.academy = {
                    nombre: 'Academia Dragón Dorado',
                    direccion: 'Av. Principal 123',
                    telefono: '555-0199',
                    url: 'https://dragondorado.com',
                    descripcion: 'Academia líder en artes marciales mixtas.'
                };
            }

            const savedLogo = localStorage.getItem('my_academy_logo');
            if (savedLogo) {
                this.logoUrl = savedLogo;
            }

            // Datos dummy para instructores y estudiantes
            if (this.hasAcademy) {
                this.instructors = [
                    { id: 100, nombre: 'Yo (Dueño)', email: 'propietario@dinamyt.com', cargo: 'Director Técnico', isOwner: true },
                    { id: 101, nombre: 'Juan Pérez', email: 'juan@pro.com', cargo: 'Instructor de Combate' },
                    { id: 102, nombre: 'Ana García', email: 'ana@pro.com', cargo: 'Instructora de Poomsae' }
                ];
                this.students = [
                    { id: 501, nombre: 'Carlos Ruiz', cinturon: 'Amarillo', edad: 12, instructor: 'Yo (Dueño)' },
                    { id: 502, nombre: 'Sofía Díaz', cinturon: 'Azul', edad: 15, instructor: 'Juan Pérez' },
                    { id: 503, nombre: 'Pedro Sánchez', cinturon: 'Blanco', edad: 10, instructor: 'Ana García' },
                    { id: 504, nombre: 'Marta Soto', cinturon: 'Verde', edad: 14, instructor: 'Juan Pérez' }
                ];
            }

            this.loading = false;
        }, 800);
    }


    goBack(): void {
        this.backNav.backOr({ fallbackUrl: '/dashboard' });
    }

    onLogoChange(event: any): void {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.logoPreview = e.target?.result || null;
                // Guardar base64 localmente por ahora
                if (typeof this.logoPreview === 'string') {
                    localStorage.setItem('my_academy_logo', this.logoPreview);
                    this.logoUrl = this.logoPreview;
                }
            };
            reader.readAsDataURL(file);
        }
    }

    async saveAcademy(): Promise<void> {
        if (!this.academy.nombre) {
            this.message = 'El nombre de la academia es obligatorio.';
            this.success = false;
            return;
        }

        this.saving = true;
        this.message = null;
        const startedAt = Date.now();

        try {
            // Simular guardado
            localStorage.setItem('my_academy_data', JSON.stringify(this.academy));
            this.hasAcademy = true;

            await delayRemaining(startedAt, 800);
            this.success = true;
            this.message = 'Academia guardada correctamente.';
        } catch (err) {
            this.success = false;
            this.message = 'Error al guardar los datos.';
        } finally {
            this.saving = false;
            setTimeout(() => this.message = null, 3000);
        }
    }

    async deleteAcademy(): Promise<void> {
        if (!confirm('¿Estás seguro de que deseas eliminar tu academia? Esta acción no se puede deshacer.')) return;

        this.saving = true;
        const startedAt = Date.now();

        localStorage.removeItem('my_academy_data');
        localStorage.removeItem('my_academy_logo');

        await delayRemaining(startedAt, 1000);

        this.hasAcademy = false;
        this.academy = { nombre: '', direccion: '', telefono: '', url: '', descripcion: '' };
        this.logoUrl = null;
        this.logoPreview = null;
        this.saving = false;
        this.message = 'Academia eliminada.';
        this.success = true;
    }

    addInstructor(): void {
        if (!this.newEmail) return;
        // Simular búsqueda y adición
        this.instructors.push({
            id: Date.now(),
            nombre: 'Nuevo Instructor',
            email: this.newEmail,
            cargo: 'Por asignar'
        });
        this.newEmail = '';
    }

    removeInstructor(id: number): void {
        this.instructors = this.instructors.filter(i => i.id !== id);
    }

    setActiveTab(tab: 'dashboard' | 'info' | 'instructors' | 'students'): void {
        this.activeTab = tab;
    }

    // --- Validation Methods ---

    private handleInputLimit(value: string, maxLength: number, fieldName: string): { value: string, msg: string } {
        let val = value || '';
        let msg = '';

        if (val.length >= maxLength) {
            val = val.slice(0, maxLength);
            msg = `Has alcanzado el límite máximo de ${maxLength} caracteres.`;
        } else if (val.length > maxLength - 20) {
            const remaining = maxLength - val.length;
            msg = `Te quedan ${remaining} caracteres disponibles.`;
        }
        return { value: val, msg };
    }

    onNombreInput(event: Event): void {
        const target = event.target as HTMLInputElement;
        const result = this.handleInputLimit(target.value, this.MAX_NAME_LEN, 'nombre');
        this.academy.nombre = result.value;
        this.nombreLimitMsg = result.msg;
        if (target.value !== result.value) target.value = result.value;
    }

    onDireccionInput(event: Event): void {
        const target = event.target as HTMLInputElement;
        const result = this.handleInputLimit(target.value, this.MAX_ADDR_LEN, 'direccion');
        this.academy.direccion = result.value;
        this.direccionLimitMsg = result.msg;
        if (target.value !== result.value) target.value = result.value;
    }

    onTelefonoInput(event: Event): void {
        const target = event.target as HTMLInputElement;
        // Solo números
        const digits = target.value.replace(/\D/g, '').slice(0, this.MAX_PHONE_LEN);
        this.academy.telefono = digits;
        if (target.value !== digits) target.value = digits;

        const result = this.handleInputLimit(digits, this.MAX_PHONE_LEN, 'telefono');
        this.telefonoLimitMsg = result.msg;
    }

    onUrlInput(event: Event): void {
        const target = event.target as HTMLInputElement;
        const result = this.handleInputLimit(target.value, this.MAX_URL_LEN, 'url');
        this.academy.url = result.value;
        this.urlLimitMsg = result.msg;
        if (target.value !== result.value) target.value = result.value;
    }

    onDescripcionInput(event: Event): void {
        const target = event.target as HTMLTextAreaElement;
        const result = this.handleInputLimit(target.value, this.MAX_DESC_LEN, 'descripcion');
        this.academy.descripcion = result.value;
        this.descripcionLimitMsg = result.msg;
        if (target.value !== result.value) target.value = result.value;
    }

    // --- Instructor Autocomplete Methods ---

    onInstructorInputChange(): void {
        this.instructorIsOpen = true;
        this.instructorFocusedIndex = 0;
        const query = (this.instructorSearchText || '').toLowerCase().trim();

        if (!query) {
            this.instructorFilteredOptions = [];
            this.instructorIsOpen = false;
            return;
        }

        this.instructorFilteredOptions = this.allAvailableInstructors.filter(opt => {
            const alreadyAdded = this.instructors.some(i => String(i.id) === String(opt.id));
            if (alreadyAdded) return false;

            return opt.nombre.toLowerCase().includes(query) ||
                opt.documento.toLowerCase().includes(query) ||
                opt.email.toLowerCase().includes(query);
        });
    }

    onInstructorInputFocus(): void {
        if (this.instructorSearchText.trim()) {
            this.onInstructorInputChange();
        }
    }

    onInstructorInputBlur(): void {
        setTimeout(() => {
            this.instructorIsOpen = false;
        }, 200);
    }

    toggleInstructorDropdown(): void {
        this.instructorIsOpen = !this.instructorIsOpen;
        if (this.instructorIsOpen) {
            this.onInstructorInputChange();
        }
    }

    selectInstructor(opt: InstructorOption): void {
        this.instructors.push({
            id: opt.id,
            nombre: opt.nombre,
            email: opt.email,
            cargo: opt.cargo || 'Instructor'
        });
        this.instructorSearchText = '';
        this.instructorIsOpen = false;
        this.instructorFilteredOptions = [];
    }
}
