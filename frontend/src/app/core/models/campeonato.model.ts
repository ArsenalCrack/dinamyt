export interface Campeonato {
    idCampeonato: number;
    nombre: string;
    ubicacion: string;
    pais: string;
    ciudad: string;
    alcance: string;
    numTatamis: number;
    maxParticipantes: number;
    esPublico: boolean;
    creadoPor: number;
    modalidades: string; // JSON string
    fechaInicio: string; // LocalDate yyyy-MM-dd
    fecha_fin: string; // LocalDate yyyy-MM-dd
    estado: string;
    participantes: number;
    puedeInscribirse: boolean;
    nombre_creador: string;
    Codigo: string;
    visible: boolean;
    secciones: string;
    seccionesActivas: string;

    // Transients/Calculated from Backend
    cuposDisponibles?: number;

    // UI specific (mapped later, or extended)
    // The user said "dejando unicamente los nombres de las variables que estan en la bd".
    // So for the raw data type, we should stick to this.
}
