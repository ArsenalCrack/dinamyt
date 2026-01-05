import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = 'http://localhost:8080/api';

  constructor(private http: HttpClient) {}

  getSaludo(): Observable<any> {
    return this.http.get(`${this.apiUrl}/saludo`);
  }
  registrarUsuario(usuario: any) {
  return this.http.post(
    'http://localhost:8080/api/registro',
    usuario
  );
  }
}
