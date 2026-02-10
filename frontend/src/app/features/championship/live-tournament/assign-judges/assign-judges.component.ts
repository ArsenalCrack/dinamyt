
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../../core/services/api.service';

export interface Juez {
    id: string; // idDocumento
    nombre: string;
    avatar: string;
    rol?: string; // Role in the system (e.g. 'Juez', 'Juez Central')
    categoria?: string;
    pais?: string;
    ciudad?: string;
    assignedToTatami?: boolean; // If assigned to ANY tatami
}

@Component({
    selector: 'app-assign-judges',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './assign-judges.component.html',
    styleUrls: ['./assign-judges.component.scss']
})
export class AssignJudgesComponent implements OnInit {
    @Input() championshipId: string | null = null;
    @Input() tatami: any; // Tatami object
    @Input() allTatamis: any[] = []; // To check other assignments
    @Output() close = new EventEmitter<void>();
    @Output() save = new EventEmitter<any>();

    jueces: Juez[] = [];
    filteredJueces: Juez[] = [];
    loading = true;
    searchQuery = '';

    // Assignments for THIS tatami
    centralJudge: Juez | null = null;
    tableJudge: Juez | null = null;
    normalJudges: Juez[] = [];

    constructor(private api: ApiService) { }

    ngOnInit(): void {
        this.loadJudges();
    }

    loadJudges() {
        if (!this.championshipId) return;
        this.loading = true;

        // Fetch judges (inscriptions with type Juez/Central/Mesa) -> same logic as details
        this.api.getJuecesByCampeonato(this.championshipId).subscribe({
            next: (data: any[]) => {
                const rawInscriptions = data || [];
                const judgePromises = rawInscriptions.map((ins: any) => {
                    const userId = ins.usuario;
                    return new Promise<Juez | null>((resolve) => {
                        this.api.searchUsers(String(userId), '0', '0', 6).subscribe({
                            next: (users: any[]) => {
                                const user = users.find(u => String(u.idDocumento) === String(userId));
                                if (user) {
                                    // Determine role from inscription
                                    const typeId = ins.tipousuario ?? ins.idTipo ?? ins.id_tipo;
                                    let role = 'Juez';
                                    if (typeId === 6) role = 'Juez Central';
                                    else if (typeId === 7) role = 'Juez de Mesa';

                                    resolve({
                                        id: user.idDocumento,
                                        nombre: user.nombreC,
                                        avatar: 'assets/avatar-1.png',
                                        rol: role,
                                        categoria: user.cinturonRango || 'N/A',
                                        pais: user.nacionalidad,
                                        ciudad: user.ciudad,
                                        assignedToTatami: false
                                    });
                                } else {
                                    resolve(null);
                                }
                            },
                            error: () => resolve(null)
                        });
                    });
                });

                Promise.all(judgePromises).then(results => {
                    this.jueces = results.filter(j => j !== null) as Juez[];
                    this.restoreAssignments();
                    this.checkAssignments();
                    this.filterJudges();
                    this.loading = false;
                });
            },
            error: (e) => {
                console.error('Error loading judges', e);
                this.loading = false;
                // Mock if needed or empty
            }
        });
    }

    // Check against all tatamis to mark assigned judges
    checkAssignments() {
        // First, mark everyone as unassigned initially
        this.jueces.forEach(j => j.assignedToTatami = false);

        // Check other tatamis
        this.allTatamis.forEach(t => {
            // Skip current tatami
            if (String(t.id) === String(this.tatami.id)) return;

            if (t.assignedJudges) {
                // If using new structure
                const aj = t.assignedJudges;
                if (aj.central) this.markAsBusy(aj.central.id);
                if (aj.table) this.markAsBusy(aj.table.id);
                if (aj.normal && Array.isArray(aj.normal)) {
                    aj.normal.forEach((j: any) => this.markAsBusy(j.id));
                }
            } else if (t.judges && Array.isArray(t.judges)) {
                // Legacy/Fallback string arrays (names or IDs? ambiguous without objects)
                // If they are just names, we can't safely mark by ID. 
                // We'll skip for now to avoid false positives or implement name matching if needed.
            }
        });
    }

    markAsBusy(id: string) {
        const judge = this.jueces.find(j => String(j.id) === String(id));
        if (judge) judge.assignedToTatami = true;
    }

    restoreAssignments() {
        if (this.tatami && this.tatami.assignedJudges) {
            const aj = this.tatami.assignedJudges;
            // Find the actual judge objects in our loaded list to ensure references are correct
            if (aj.central) {
                this.centralJudge = this.jueces.find(j => String(j.id) === String(aj.central.id)) || aj.central;
            }
            if (aj.table) {
                this.tableJudge = this.jueces.find(j => String(j.id) === String(aj.table.id)) || aj.table;
            }
            if (aj.normal && Array.isArray(aj.normal)) {
                this.normalJudges = aj.normal.map((nj: any) =>
                    this.jueces.find(j => String(j.id) === String(nj.id)) || nj
                );
            }
        }
    }

    filterJudges() {
        const q = this.searchQuery.toLowerCase();
        this.filteredJueces = this.jueces.filter(j =>
            !j.assignedToTatami &&
            !this.isSelected(j) &&
            (j.nombre.toLowerCase().includes(q) || (j.rol && j.rol.toLowerCase().includes(q)))
        );
    }

    isSelected(j: Juez): boolean {
        return (this.centralJudge?.id === j.id) ||
            (this.tableJudge?.id === j.id) ||
            this.normalJudges.some(nj => nj.id === j.id);
    }

    assignCentral(j: Juez) {
        if (this.centralJudge) {
            // Return old one to pool
        }
        this.centralJudge = j;
        this.filterJudges();
    }

    assignTable(j: Juez) {
        this.tableJudge = j;
        this.filterJudges();
    }

    assignNormal(j: Juez) {
        this.normalJudges.push(j);
        this.filterJudges();
    }

    unassignCentral() {
        this.centralJudge = null;
        this.filterJudges();
    }

    unassignTable() {
        this.tableJudge = null;
        this.filterJudges();
    }

    unassignNormal(index: number) {
        this.normalJudges.splice(index, 1);
        this.filterJudges();
    }

    onSave() {
        // Construct the payload
        // We might need to save structure: { central: id, table: id, normal: [ids] }
        // Or just a flat list if the backend only supports that.
        // User asked "solo se puede asignar un juez central, varios jueces normales y un juez de mesa"
        // So the UI enforces this. The data passing back can be an object.
        const result = {
            central: this.centralJudge,
            table: this.tableJudge,
            normal: this.normalJudges
        };
        this.save.emit(result);
    }
}
