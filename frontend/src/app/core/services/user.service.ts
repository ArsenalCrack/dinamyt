import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class UserService {
    private apiUrl = 'http://localhost:8080/api';

    constructor(private http: HttpClient) { }

    getCurrentUser(user: any) {
        return this.http.post(`${this.apiUrl}/me`, user);
    }

    setTempEmail(email: string) {
        localStorage.setItem('temp_email', email);
    }

    updateProfile(data: any) {
        return this.http.put(`${this.apiUrl}/perfil`, data);
    }

    uploadProfilePhoto(file: File) {
        const form = new FormData();
        form.append('foto', file);
        return this.http.post(`${this.apiUrl}/perfil/foto`, form);
    }

    searchUsers(query: string,excluirId: string,idCampeonato: string): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/usuarios/search/${query}`, {params: {excluirId,idCampeonato}});
    }

}
