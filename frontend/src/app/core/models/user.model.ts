export type UserRole = 'admin' | 'creator' | 'usuario' | 'administrador' | 'admin_proyecto' | string;

export interface User {
    username?: string;
    name?: string;
    nombreC?: string; // Nombre completo (backend variation)
    correo?: string;
    email?: string;
    roles?: UserRole[];
    roleNames?: UserRole[]; // Some backends might use this
    authorities?: UserRole[]; // Spring Security standard
    tipousuario?: any; // Object with ID/description

    // Specific flags
    canCreateChampionship?: boolean;

    // Championship counts/lists
    myChampionships?: any[];
    createdChampionships?: any[];
    championships?: any[];
    championshipsCount?: number;
    createdCount?: number;

    // Profile fields
    idDocumento?: string;
    sexo?: string;
    fechaNacimiento?: string;
    cinturon_rango?: string;
    cinturonRango?: string;
    nacionalidad?: string;
    numero_celular?: string;
    numeroCelular?: string;
    academia?: string;
    Instructor?: string;
    instructor?: string;
}
