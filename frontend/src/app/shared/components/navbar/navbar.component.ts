import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit {
  username: string | null = null;
  isLoggedIn = false;
  loading = true;

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.username = sessionStorage.getItem('username') || sessionStorage.getItem('userName');
    const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken') || null;
    // consider user logged if token exists or username exists; we'll try to enrich from API
    this.isLoggedIn = !!(token || this.username);
    this.api.getCurrentUser().subscribe({
      next: (u: any) => {
        this.username = this.username || u?.username || u?.name || null;
        this.isLoggedIn = true;
        this.loading = false;
      },
      error: () => {
        // API may fail if no cookie/token; keep inferred state
        this.loading = false;
      }
    });
  }

  logout() {
    // clear session and redirect
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userName');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('authToken');
    // optionally clear other auth keys
    this.username = null;
    this.isLoggedIn = false;
    // navigate then reload to ensure app-wide state updates
    this.router.navigate(['/']).then(() => location.reload());
  }
}
