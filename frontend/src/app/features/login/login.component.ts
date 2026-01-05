import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {

  private location = inject(Location);

  mostrarPass: boolean = false;
  errorMessage: string | null = null;

  volverAtras() {
    this.location.back();
  }

  login() {
    console.log('Formulario enviado');
  }



}
