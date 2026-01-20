import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class NavigationHistoryService {
  private currentUrl: string | null = null;
  private previousUrl: string | null = null;

  constructor(private router: Router) {
    this.currentUrl = this.router.url || null;

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd)
      )
      .subscribe((e) => {
        this.previousUrl = this.currentUrl;
        this.currentUrl = e.urlAfterRedirects;
      });
  }

  getCurrentUrl(): string | null {
    return this.currentUrl;
  }

  getPreviousUrl(): string | null {
    return this.previousUrl;
  }
}
