import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router'; // <--- 1. IMPORTANTE: Importar esto

@Component({
  selector: 'app-navbar',
  standalone: true,
  // 2. AGREGARLO AQUÍ EN LA LISTA DE IMPORTS
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {

}
