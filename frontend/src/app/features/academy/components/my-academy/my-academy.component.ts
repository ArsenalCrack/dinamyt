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
    cargando = true;
    usuario: any = null;
    tipoUsuario: number = 0;

    // Estados
    mostrarBotonCrear = false;
    mostrarFormularioUnirse = false;
    mostrarFormularioCrear = false;

    // Datos del Formulario de Unirse
    opcionesAcademia: any[] = [];
    opcionesInstructor: any[] = [];
    idAcademiaSeleccionada: string | null = null;
    idInstructorSeleccionado: string | null = null;

    // Datos del Formulario de Crear
    nuevaAcademia = {
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

    enviando = false;
    mensaje: string | null = null;
    exito = false;

    constructor(
        private api: ApiService,
        private router: Router,
        private locationService: LocationService,
        private scrollLock: ScrollLockService
    ) { }

    ngOnInit(): void {
        this.cargarUsuario();
        this.inicializarDatosUbicacion();
    }

    private inicializarDatosUbicacion() {
        this.paisesList = this.locationService.getAllCountries().map(c => c.name).sort();
    }

    onCountryChange() {
        this.ciudadesList = [];
        this.nuevaAcademia.ciudad = '';
        if (!this.nuevaAcademia.pais) return;

        const country = this.locationService.getCountryByName(this.nuevaAcademia.pais);
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

    cargarUsuario() {
        this.cargando = true;
        this.scrollLock.lock();

        // 1. Intentar cargar desde localStorage primero
        const storedUser = localStorage.getItem('usuario');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                this.usuario = parsed.usuario || parsed;
                const roles = extractUserRoles(this.usuario);
                this.establecerTipoDesdeRoles(roles);

                if (this.tipoUsuario !== 0) {
                    this.verificarEstadoAcademia(this.usuario);
                    this.cargando = false;
                    this.scrollLock.unlock();
                }
            } catch (e) { }
        }

        const idDoc = sessionStorage.getItem('ID_documento') || sessionStorage.getItem('idDocumento');
        const tipoUsuarioSesion = sessionStorage.getItem('tipo_usuario');

        this.api.getCurrentUser({ ID_documento: idDoc, tipo_usuario: tipoUsuarioSesion })
            .pipe(delay(1000))
            .subscribe({
                next: (u: any) => {
                    const esEco = !('academia' in u) && !('instructor' in u);

                    if (!esEco) {
                        this.usuario = u;
                        const roles = extractUserRoles(u);
                        this.establecerTipoDesdeRoles(roles);
                        this.verificarEstadoAcademia(u);
                    } else {

                        const roles = extractUserRoles(u);
                        if (roles.length > 0) {
                            this.establecerTipoDesdeRoles(roles);
                        }

                        if (!this.usuario) {
                            this.usuario = u;
                            this.verificarEstadoAcademia(u);
                        } else {
                            this.verificarEstadoAcademia(this.usuario);
                        }
                    }
                    if (this.cargando) {
                        this.cargando = false;
                        this.scrollLock.unlock();
                    }
                },
                error: (err) => {
                    if (!this.usuario) this.mensaje = "Error cargando perfil.";
                    if (this.cargando) {
                        this.cargando = false;
                        this.scrollLock.unlock();
                    }
                }
            });
    }

    establecerTipoDesdeRoles(roles: string[]) {
        let tipo = 1;
        if (roles.includes('dueño')) tipo = 4;
        else if (roles.includes('administrador') || roles.includes('admin_proyecto')) tipo = 3;
        else if (roles.includes('instructor')) tipo = 2;
        else tipo = 1;

        // Forzar tipo desde sesión si está presente y es válido
        try {
            const sessType = sessionStorage.getItem('tipo_usuario');
            if (sessType) {
                const sessTypeId = Number(sessType);
                if (!isNaN(sessTypeId) && sessTypeId > 1) {
                    tipo = sessTypeId;
                }
            }
        } catch (e) { }

        // CRÍTICO: Prevenir degradación de roles establecidos
        if (this.tipoUsuario > 1 && tipo === 1) {
            tipo = this.tipoUsuario;
        }

        this.tipoUsuario = tipo;
    }

    verificarEstadoAcademia(u: any) {
        const esInvalido = (val: any) => !val || val === '0' || val === 0 || val === 'null';
        const tieneAcademia = !esInvalido(u.academia) && !esInvalido(u.ID_Academia);
        const tieneInstructor = !esInvalido(u.instructor) && !esInvalido(u.ID_Instructor);



        // Resetear estados
        this.mostrarBotonCrear = false;
        this.mostrarFormularioUnirse = false;

        if (this.tipoUsuario === 4) {
            // Dueño
            if (!tieneAcademia) {
                if (!this.mostrarFormularioCrear) {
                    this.mostrarBotonCrear = true;
                }
                this.mostrarFormularioUnirse = false;
            } else {
                this.router.navigate(['/dashboard']);
            }
        } else {
            // Otros
            this.mostrarFormularioCrear = false;
            if (!tieneAcademia) {
                this.mostrarFormularioUnirse = true;
                this.cargarAcademias();
            } else {
                this.mensaje = "Ya perteneces a una academia.";
            }
        }
    }

    // Getter/Setter para selección de academia
    get idAcademia(): string | null {
        return this.idAcademiaSeleccionada;
    }

    set idAcademia(val: string | null) {
        this.idAcademiaSeleccionada = val;
        this.idInstructorSeleccionado = null;
        this.opcionesInstructor = [];

        if (val) {
            this.cargarInstructores(val);
        }
    }

    cargarAcademias() {
        this.api.cargaracademias().subscribe({
            next: (data) => {
                this.opcionesAcademia = (data || [])
                    .filter(a => a.id !== 0 && a.ID_academia !== 0)
                    .map(a => ({
                        value: String(a.id || a.ID_academia || ''),
                        label: a.nombre || a.Nombre_academia
                    }));
            }
        });
    }

    cargarInstructores(idAcademia: string) {
        this.api.cargarinstructor(Number(idAcademia), '').subscribe({
            next: (data) => {
                this.opcionesInstructor = (data || []).map(i => {
                    const usuario = i.Instructor || i;
                    return {
                        value: String(usuario.id || usuario.ID_documento || usuario.idDocumento || usuario.documento || ''),
                        label: usuario.nombreC || usuario.nombre || (usuario.nombre + ' ' + usuario.apellido)
                    };
                });
            },
            error: () => { }
        });
    }

    unirseAcademia() {
        if (!this.idAcademiaSeleccionada || !this.idInstructorSeleccionado) return;

        this.enviando = true;

        const payload = {
            idAcademia: this.idAcademiaSeleccionada,
            Instructor: this.idInstructorSeleccionado,
            userId: this.usuario.idDocumento || this.usuario.id
        };

        this.api.registrarseEnAcademia(payload).subscribe({
            next: (res) => {
                this.exito = true;
                this.mensaje = 'Solicitud enviada o inscripción exitosa.';
                this.enviando = false;
            },
            error: (err) => {
                this.exito = false;
                this.mensaje = err.error?.message || 'Error al inscribirse.';
                this.enviando = false;
            }
        });
    }

    alternarFormularioCrear() {
        this.mostrarFormularioCrear = !this.mostrarFormularioCrear;
        this.mostrarBotonCrear = !this.mostrarFormularioCrear;
        this.mensaje = null;
    }

    crearAcademia() {
        if (!this.nuevaAcademia.nombre || !this.nuevaAcademia.direccion || !this.nuevaAcademia.numeroContacto || !this.nuevaAcademia.descripcion || !this.nuevaAcademia.pais || !this.nuevaAcademia.ciudad) {
            this.mensaje = "Por favor completa todos los campos obligatorios.";
            this.exito = false;
            return;
        }

        this.enviando = true;
        this.mensaje = null;

        const payload = {
            ...this.nuevaAcademia,
            ownerId: this.usuario.idDocumento || this.usuario.ID_documento || this.usuario.id
        };

        this.api.createAcademy(payload).subscribe({
            next: (res: any) => {
                this.exito = true;
                this.mensaje = "Academia creada exitosamente!";
                this.enviando = false;
                this.mostrarFormularioCrear = false;
                // Recargar usuario para actualizar el estado
                setTimeout(() => this.cargarUsuario(), 1500);
            },
            error: (err) => {
                this.exito = false;
                this.mensaje = err.error?.message || "Error al crear academia.";
                this.enviando = false;
            }
        });
    }
}
