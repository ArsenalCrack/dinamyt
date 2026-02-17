import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common'; // Import Location
import { delay } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

interface Invitacion {
  id: number;
  documento: string; // Documento del usuario
  nombre: string;
  email: string;
  avatar?: string; // Opcional: avatar
  rol?: string; // Para jueces: Juez Central, Mesa, etc.
  estado: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO';
  tipo: 'COMPETIDOR' | 'JUEZ';
  fechaEnvio: string;
}

import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-championship-invitations',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomSelectComponent, LoadingSpinnerComponent],
  templateUrl: './championship-invitations.component.html',
  styleUrls: ['./championship-invitations.component.scss']
})
export class ChampionshipInvitationsComponent implements OnInit {
  idCampeonato: string | null = null;

  opcionesRolJuez = [
    { value: 'Juez Central', label: 'Juez Central' },
    { value: 'Juez de Mesa', label: 'Juez de Mesa' },
    { value: 'Juez', label: 'Juez' }
  ];

  // Estados
  seccionActiva: 'COMPETIDOR' | 'JUEZ' = 'COMPETIDOR';
  pestanaActiva: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' = 'PENDIENTE';
  busqueda: string = '';

  // Datos
  invitaciones: Invitacion[] = [];
  invitacionesFiltradas: Invitacion[] = [];
  invitacionesPaginadas: Invitacion[] = [];

  // Paginación
  paginaActual: number = 1;
  itemsPorPagina: number = 6;
  totalPaginas: number = 1;

  // Estados del Modal de Invitación
  modalInvitarAbierto = false;
  busquedaInvitar = '';
  usuariosDisponibles: any[] = []; // Usuarios encontrados
  usuarioSeleccionado: any | null = null;
  rolJuezSeleccionado: string = 'Juez';
  enviandoInvitacion = false;
  cargando = false;

  // Estados del Modal
  modalCancelarAbierto = false;
  idObjetivoCancelar: number | null = null;

  avisoVisible = false;
  avisoEsError = false;
  mensajeAviso = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private api: ApiService,
    private scrollLock: ScrollLockService
  ) { }

  ngOnInit(): void {
    this.idCampeonato = this.route.snapshot.paramMap.get('id');
    if (this.idCampeonato) {
      this.cargarInvitaciones();
    } else {
      this.aplicarFiltros();
    }
  }

  private mapEstado(estado: number): 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' {
    switch (estado) {
      case 2: return 'PENDIENTE';
      case 3: return 'ACEPTADO';
      case 4: return 'RECHAZADO';
      default: return 'PENDIENTE';
    }
  }

  cargarInvitaciones(): void {
    if (!this.idCampeonato) return;
    this.cargando = true;
    this.scrollLock.lock();

    this.api.getInvitationsByChampionship(this.idCampeonato)
      .pipe(delay(1000))
      .subscribe({
        next: (data) => {
          if (data && Array.isArray(data)) {
            this.invitaciones = data.map((item: any) => ({
              id: item.id || item.idincripcion,
              documento: item.idDocumento || item.usuario || '0',
              nombre: item.nombreC || item.nombre || 'Usuario',
              email: item.email || item.correo || '',
              avatar: item.avatar || '',
              rol: item.rol,
              estado: this.mapEstado(item.estado),
              tipo: item.tipoUsuario === 5 ? 'COMPETIDOR' : 'JUEZ',
              fechaEnvio: item.fechaInscripcion || item.fecha_inscripcion || item.fecha || item.fechaEnvio || item.fecha_envio || new Date().toISOString()
            }));
            this.aplicarFiltros();
          } else {
            this.aplicarFiltros();
          }
          this.cargando = false;
          this.scrollLock.unlock();
        },
        error: (err) => {
          console.warn('API de invitaciones no disponible.', err);
          this.aplicarFiltros();
          this.cargando = false;
          this.scrollLock.unlock();
        }
      });
  }


  volverAtras(): void {
    this.location.back();
  }

  seleccionarSeccion(seccion: 'COMPETIDOR' | 'JUEZ'): void {
    this.seccionActiva = seccion;
    this.paginaActual = 1; // Reiniciar paginación al cambiar de sección
    this.aplicarFiltros();
  }

  seleccionarPestana(tab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO'): void {
    this.pestanaActiva = tab;
    this.paginaActual = 1;
    this.aplicarFiltros();
  }

  aplicarFiltros(): void {
    const q = this.busqueda.toLowerCase().trim();

    this.invitacionesFiltradas = this.invitaciones.filter(item => {
      // 1. Filtrar por Sección (Tipo)
      const coincideTipo = item.tipo === this.seccionActiva;

      // 2. Filtrar por Estado (Pestaña)
      const coincideEstado = item.estado === this.pestanaActiva;

      // 3. Filtrar por Búsqueda (Nombre, Email o Documento)
      const coincideBusqueda = !q ||
        item.nombre.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.documento.includes(q);

      return coincideTipo && coincideEstado && coincideBusqueda;
    });

    this.actualizarPaginacion();
  }

  actualizarPaginacion(): void {
    this.totalPaginas = Math.ceil(this.invitacionesFiltradas.length / this.itemsPorPagina) || 1;
    if (this.paginaActual > this.totalPaginas) this.paginaActual = 1;

    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    this.invitacionesPaginadas = this.invitacionesFiltradas.slice(inicio, fin);
  }

  paginaSiguiente(): void {
    if (this.paginaActual < this.totalPaginas) {
      this.paginaActual++;
      this.actualizarPaginacion();
      this.irArriba();
    }
  }

  paginaAnterior(): void {
    if (this.paginaActual > 1) {
      this.paginaActual--;
      this.actualizarPaginacion();
      this.irArriba();
    }
  }

  irArriba(): void {
    const el = document.getElementById('invitations-top-anchor');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Lógica del Modal de Invitar
  abrirModalInvitar(): void {
    this.modalInvitarAbierto = true;
    this.scrollLock.lock();
    this.busquedaInvitar = '';
    this.usuariosDisponibles = [];
    this.usuarioSeleccionado = null;
    this.usuarioSeleccionado = null;
    this.rolJuezSeleccionado = 'Juez';
  }

  cerrarModalInvitar(): void {
    this.modalInvitarAbierto = false;
    this.scrollLock.unlock();
  }

  private obtenerTipoInscripcion(): number {
    if (this.seccionActiva === 'COMPETIDOR') {
      return 5;
    }
    // Para juez basta con enviar uno cualquiera (ej: 6)
    return 6;
  }

  buscarUsuarios(): void {
    if (!this.busquedaInvitar.trim()) {
      this.usuariosDisponibles = [];
      return;
    }
    const tipo = this.obtenerTipoInscripcion();
    this.api.searchUsers(this.busquedaInvitar, sessionStorage.getItem('idDocumento') || '', this.idCampeonato || '', tipo).subscribe({
      next: (users) => {
        this.usuariosDisponibles = (users || [])
          .filter(u => (u.idDocumento || u.documento || u.id) != '0')
          .map(u => ({
            id: u.idDocumento || u.documento || u.id,
            nombre: u.nombreC || u.nombre,
            email: u.correo || u.email || 'Sin correo visible',
            avatar: u.avatar || 'assets/default-avatar.png'
          }));
      },
      error: (err) => {
        console.error('Error buscando usuarios:', err);
        this.usuariosDisponibles = [];
      }
    });
  }

  seleccionarUsuario(usuario: any): void {
    this.usuarioSeleccionado = usuario;
    this.usuariosDisponibles = []; // Limpiar lista para mostrar estado de selección
  }

  deseleccionarUsuario(): void {
    this.usuarioSeleccionado = null;
    this.buscarUsuarios(); // Mostrar resultados nuevamente
  }

  enviarInvitacion(): void {
    if (!this.usuarioSeleccionado) return;

    this.enviandoInvitacion = true;

    // Determinar ID_tipo
    let idTipo = 5; // Por defecto Competidor
    if (this.seccionActiva === 'JUEZ') {
      switch (this.rolJuezSeleccionado) {
        case 'Juez Central': idTipo = 6; break;
        case 'Juez de Mesa': idTipo = 7; break;
        case 'Juez': idTipo = 8; break;
        default: idTipo = 8;
      }
    }

    const payload = {
      id_usuario: this.usuarioSeleccionado.id,
      id_campeonato: this.idCampeonato || '',
      id_tipo: idTipo
    };

    this.api.enviarInvitacion(payload).subscribe({
      next: (res) => {
        const nuevaInvitacion: Invitacion = {
          id: res.id || Math.floor(Math.random() * 10000), // Usar ID de la respuesta si está disponible
          documento: this.usuarioSeleccionado.id,
          nombre: this.usuarioSeleccionado.nombre,
          email: this.usuarioSeleccionado.email,
          avatar: this.usuarioSeleccionado.avatar,
          tipo: this.seccionActiva,
          estado: 'PENDIENTE',
          fechaEnvio: new Date().toISOString().split('T')[0],
          rol: this.seccionActiva === 'JUEZ' ? this.rolJuezSeleccionado : undefined
        };

        this.invitaciones.unshift(nuevaInvitacion); // Agregar al inicio
        this.enviandoInvitacion = false;
        this.cerrarModalInvitar();
        this.mostrarAviso(`Invitación enviada a ${nuevaInvitacion.nombre}`);

        // Cambiar a pestaña "Pendientes" para que el usuario la vea
        this.seleccionarPestana('PENDIENTE');
        this.aplicarFiltros();
      },
      error: (err) => {
        console.error('Error enviando invitación', err);
        this.enviandoInvitacion = false;
        // No cerrar modal en caso de error para que el usuario pueda reintentar
        this.mostrarAviso(err.error?.message || 'No se ha enviado con exito', true);
      }
    });
  }

  // Lógica de Cancelar / Eliminar Invitación
  confirmarCancelacion(id: number): void {
    this.idObjetivoCancelar = id;
    this.modalCancelarAbierto = true;
    this.scrollLock.lock();
  }

  cerrarModalCancelar(): void {
    this.modalCancelarAbierto = false;
    this.idObjetivoCancelar = null;
    this.scrollLock.unlock();
  }

  finalizarCancelacion(): void {
    if (this.idObjetivoCancelar) {
      this.api.deleteInvitation(this.idObjetivoCancelar).subscribe({
        next: () => {
          // Remover de la lista
          this.invitaciones = this.invitaciones.filter(i => i.id !== this.idObjetivoCancelar);

          const msg = this.pestanaActiva === 'PENDIENTE'
            ? 'Invitación cancelada correctamente.'
            : 'Usuario eliminado de la lista de invitaciones.';

          this.mostrarAviso(msg);
          this.aplicarFiltros();
          this.cerrarModalCancelar();
        },
        error: (err) => {
          console.error('Error eliminando invitación', err);
          this.mostrarAviso('Error al cancelar la invitación: ' + (err.error?.message || 'Error desconocido'), true);
          this.cerrarModalCancelar();
        }
      });
    } else {
      this.cerrarModalCancelar();
    }
  }

  mostrarAviso(msg: string, esError: boolean = false): void {
    this.mensajeAviso = msg;
    this.avisoEsError = esError;
    this.avisoVisible = true;
    setTimeout(() => {
      this.avisoVisible = false;
    }, 3000);
  }
}
