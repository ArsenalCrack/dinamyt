import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { delay } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { extractUserRoles } from '../../../../core/utils/user-type.util';
import { CountryAutocompleteComponent } from '../../../../shared/components/country-autocomplete/country-autocomplete.component';
import { LocationService } from '../../../../core/services/location.service';
import { SearchableSelectComponent } from '../../../../shared/components/searchable-select/searchable-select.component';
import { ScrollLockService } from '../../../../core/services/scroll-lock.service';

@Component({
    selector: 'app-my-academy',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, LoadingSpinnerComponent, CustomSelectComponent, CountryAutocompleteComponent, SearchableSelectComponent],
    templateUrl: './my-academy.component.html',
    styleUrls: ['./my-academy.component.scss']
})
export class MyAcademyComponent implements OnInit {
    loading = true;
    user: any = null;
    userType: number = 0;

    // States
    showCreateBtn = false;
    showJoinForm = false;
    showCreateForm = false;

    // Join Form Data
    academyOptions: any[] = [];
    instructorOptions: any[] = [];
    selectedAcademyId: string | null = null;
    selectedInstructorId: string | null = null;

    // Create Form Data
    newAcademy = {
        nombre: '',
        direccion: '',
        numeroContacto: '',
        linkRedSocial: '',
        descripcion: '',
        pais: '',
        ciudad: ''
    };
    paisesList: string[] = [];
    ciudadesList: string[] = [];
    ciudadMaxLength = 50;

    submitting = false;
    message: string | null = null;
    success = false;

    constructor(
        private api: ApiService,
        private router: Router,
        private locationService: LocationService,
        private scrollLock: ScrollLockService
    ) { }

    ngOnInit(): void {
        this.loadUser();
        this.initLocationData();
    }

    private initLocationData() {
        this.paisesList = this.locationService.getAllCountries().map(c => c.name).sort();
    }

    onCountryChange() {
        this.ciudadesList = [];
        this.newAcademy.ciudad = '';
        if (!this.newAcademy.pais) return;

        const country = this.locationService.getCountryByName(this.newAcademy.pais);
        if (country) {
            this.ciudadesList = this.locationService.getCitiesByCountryCode(country.isoCode)
                .map(c => c.name)
                .sort();

            if (this.ciudadesList.length > 0) {
                this.ciudadMaxLength = this.ciudadesList.reduce((max, c) => Math.max(max, c.length), 0);
            } else {
                this.ciudadMaxLength = 50;
            }
        }
    }

    loadUser() {
        this.loading = true;
        this.scrollLock.lock();

        // 1. Try to load from LocalStorage first (Source of Truth for Navbar)
        const storedUser = localStorage.getItem('usuario');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                this.user = parsed.usuario || parsed;
                const roles = extractUserRoles(this.user);
                this.setUserTypeFromRoles(roles);
                console.log('User loaded from LocalStorage:', this.user, 'Type:', this.userType);

                // If we found a valid type, we can stop loading or continue to API for updates
                if (this.userType !== 0) {
                    this.checkAcademyStatus(this.user);
                    this.loading = false;
                    this.scrollLock.unlock();
                }
            } catch (e) { console.error('Error parsing stored user', e); }
        }

        const idDoc = sessionStorage.getItem('ID_documento') || sessionStorage.getItem('idDocumento');
        const tipoUsuario = sessionStorage.getItem('tipo_usuario');

        this.api.getCurrentUser({ ID_documento: idDoc, tipo_usuario: tipoUsuario })
            .pipe(delay(1000))
            .subscribe({
                next: (u: any) => {
                    // If API returns a valid object with ID (not just empty echo), update
                    // But if API is just echoing inputs and missing fields, ignore it or merge carefully
                    // The echo problem: u might be { ID_documento: "...", tipo_usuario: "..." } but missing 'academia', 'instructor' fields

                    // Simple heuristic: if u has 'academia' (even if null) it's likely a real DB object. 
                    // If u only has what we sent, it's an echo.
                    // Check if API returned a valid object vs an echo
                    // Echo often lacks 'academia' or 'instructor' whole objects, BUT might contain 'tipo_usuario'
                    const isEcho = !('academia' in u) && !('instructor' in u);

                    if (!isEcho) {
                        this.user = u;
                        const roles = extractUserRoles(u);
                        this.setUserTypeFromRoles(roles);
                        this.checkAcademyStatus(u);
                    } else {
                        console.warn('API returned potential echo. Response:', u);
                        // Even if it is an echo, it might hold the correct 'tipo_usuario' we just sent.
                        // If local storage is stale (Type 1) but this response clearly says Type 4, trust this response for the TYPE at least.

                        const roles = extractUserRoles(u);
                        if (roles.length > 0) {
                            this.setUserTypeFromRoles(roles); // FORCE update type from API response
                        }

                        if (!this.user) {
                            this.user = u; // Use this as fallback user object if nothing local
                            this.checkAcademyStatus(u);
                        } else {
                            // We have local user, re-check status with POTENTIALLY UPDATED type
                            this.checkAcademyStatus(this.user);
                        }
                    }
                    if (this.loading) {
                        this.loading = false;
                        this.scrollLock.unlock();
                    }
                },
                error: (err) => {
                    console.error(err);
                    if (!this.user) this.message = "Error cargando perfil.";
                    if (this.loading) {
                        this.loading = false;
                        this.scrollLock.unlock();
                    }
                }
            });
    }

    setUserTypeFromRoles(roles: string[]) {
        let type = 1;
        if (roles.includes('dueño')) type = 4;
        else if (roles.includes('administrador') || roles.includes('admin_proyecto')) type = 3;
        else if (roles.includes('instructor')) type = 2;
        else type = 1;

        // Force override from session if present and valid
        try {
            const sessType = sessionStorage.getItem('tipo_usuario');
            if (sessType) {
                const sessTypeId = Number(sessType);
                // Trust session more if it is 'higher' or more specific than default 1
                if (!isNaN(sessTypeId) && sessTypeId > 1) {
                    type = sessTypeId;
                }
            }
        } catch (e) { }

        // CRITICAL: Prevent downgrading of ANY established role (Owner, Admin, Instructor) to 'Usuario' (1)
        // This protects against incomplete API "echo" responses that miss role arrays.
        // If we previously knew they were type X (> 1), and now we calculate 1, keep X.
        if (this.userType > 1 && type === 1) {
            console.log(`Preserving UserType ${this.userType} despite missing roles in current update (calculated ${type})`);
            type = this.userType;
        }

        this.userType = type;
    }

    checkAcademyStatus(u: any) {
        const isInvalid = (val: any) => !val || val === '0' || val === 0 || val === 'null';
        const hasAcademia = !isInvalid(u.academia) && !isInvalid(u.ID_Academia);
        const hasInstructor = !isInvalid(u.instructor) && !isInvalid(u.ID_Instructor);

        console.log('UserType:', this.userType, 'HasAcademia:', hasAcademia, 'HasInstructor:', hasInstructor);

        // Reset states
        this.showCreateBtn = false;
        this.showJoinForm = false;

        if (this.userType === 4) {
            // Owner
            if (!hasAcademia) {
                // Only show button if form is not active
                if (!this.showCreateForm) {
                    this.showCreateBtn = true;
                }
                this.showJoinForm = false;
            } else {
                this.router.navigate(['/dashboard']);
            }
        } else {
            // Others
            this.showCreateForm = false;
            if (!hasAcademia) {
                this.showJoinForm = true;
                this.loadAcademias();
            } else {
                this.message = "Ya perteneces a una academia.";
            }
        }
    }

    // Getter/Setter for Academy Selection to handle side effects cleanly
    get academyId(): string | null {
        return this.selectedAcademyId;
    }

    set academyId(val: string | null) {
        this.selectedAcademyId = val;
        this.selectedInstructorId = null;
        this.instructorOptions = [];

        if (val) {
            this.loadInstructors(val);
        }
    }

    loadAcademias() {
        this.api.cargaracademias().subscribe({
            next: (data) => {
                this.academyOptions = (data || [])
                    .filter(a => a.id !== 0 && a.ID_academia !== 0) // Filter invalid ID 0
                    .map(a => ({
                        value: String(a.id || a.ID_academia || ''),
                        label: a.nombre || a.Nombre_academia
                    }));
            }
        });
    }

    // Extracted side effect logic
    loadInstructors(academyId: string) {
        this.api.cargarinstructor(Number(academyId), '').subscribe({
            next: (data) => {
                this.instructorOptions = (data || []).map(i => {
                    // Handle potential nesting or direct user object
                    const user = i.Instructor || i; // If wrapped in 'Instructor' property? or just 'i'
                    return {
                        value: String(user.id || user.ID_documento || user.idDocumento || user.documento || ''),
                        label: user.nombreC || user.nombre || (user.nombre + ' ' + user.apellido)
                    };
                });
            },
            error: (err) => console.error('Error loading instructors', err)
        });
    }

    joinAcademy() {
        if (!this.selectedAcademyId || !this.selectedInstructorId) return;

        this.submitting = true;

        // Use field names matching Backend/DB expectations
        const payload = {
            idAcademia: this.selectedAcademyId,
            Instructor: this.selectedInstructorId, // Changed to 'Instructor' per user request
            userId: this.user.idDocumento || this.user.id
        };

        this.api.registrarseEnAcademia(payload).subscribe({
            next: (res) => {
                this.success = true;
                this.message = 'Solicitud enviada o inscripción exitosa.';
                this.submitting = false;
            },
            error: (err) => {
                this.success = false;
                this.message = err.error?.message || 'Error al inscribirse.';
                this.submitting = false;
            }
        });
    }

    toggleCreateForm() {
        this.showCreateForm = !this.showCreateForm;
        this.showCreateBtn = !this.showCreateForm;
        this.message = null;
    }

    createAcademy() {
        if (!this.newAcademy.nombre || !this.newAcademy.direccion || !this.newAcademy.numeroContacto || !this.newAcademy.descripcion || !this.newAcademy.pais || !this.newAcademy.ciudad) {
            this.message = "Por favor completa todos los campos obligatorios.";
            this.success = false;
            return;
        }

        this.submitting = true;
        this.message = null;

        const payload = {
            ...this.newAcademy,
            ownerId: this.user.idDocumento || this.user.ID_documento || this.user.id
        };

        this.api.createAcademy(payload).subscribe({
            next: (res: any) => {
                this.success = true;
                this.message = "Academia creada exitosamente!";
                this.submitting = false;
                this.showCreateForm = false;
                // Reload user to update status (should now have academy)
                setTimeout(() => this.loadUser(), 1500);
            },
            error: (err) => {
                this.success = false;
                this.message = err.error?.message || "Error al crear academia.";
                this.submitting = false;
            }
        });
    }
}
