export interface Tipousuario {
    ID_Tipo: number;
    descripcion: string;
}

export interface Academia {
    ID_academia: number;
    nombre: string;
    descripcion: string;
    direccion: string;
    numeroContacto: string;
    linkRedSocial: string;
    pais: string;
    ciudad: string;
}

export interface Inscripciones {
    idInscripcion: number;
    usuario: number; // ID linkage
    campeonato: number; // ID linkage
    secciones: string; // JSON or CSV
    tipousuario: number; // ID linkage
    fechaInscripcion: string;
    estado: number;
    invitado: boolean;
    visible: boolean;
}

export interface Usuario {
    idDocumento: number;
    nombreC: string;
    sexo: string;
    fechaNacimiento: string; // LocalDate yyyy-MM-dd
    cinturonRango: string;
    nacionalidad: string;
    ciudad: string;
    correo: string;
    contrasena?: string; // Optional for frontend usually
    numeroCelular: string;

    // Relaciones
    Instructor?: Usuario;
    academia?: Academia;
    tipousuario?: Tipousuario;

    estado?: number;

    // Transients
    codigo?: string;
    fechaCodigo?: string;
    modo?: string;
}

export interface UsuarioInscripcionDTO {
    idDocumento: number;
    nombreC: string;
    sexo: string;
    fechaNacimiento: string; // LocalDate
    cinturonRango: string;
    nacionalidad: string;
    ciudad: string;
    correo: string;
    numeroCelular: string;
    instructor: string;
    academia: string;
    secciones: string[];
    idincripcion: number; // Note: matches backend DTO typo/name
    peso: string;
    campeonato: string;
    fecha_inicio: string; // LocalDate
    ciudad_campeonato: string;
    nombre_Creador: string;
    tipoUsuario: number;
    rol: number;
    estado: number;
    fechaInscripcion: string; // LocalDateTime
}
