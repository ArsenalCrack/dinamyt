import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class NavigationHistoryService {
  private history: string[] = [];

  constructor(private router: Router) {
    // Initialize with current URL if explicitly loaded
    if (this.router.url) {
      this.history.push(this.router.url);
    }

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd)
      )
      .subscribe((e) => {
        const url = e.urlAfterRedirects;

        // Safety: prevent duplicate consecutive pushes (some redirects cause this)
        const last = this.history[this.history.length - 1];
        if (last === url) {
          return;
        }

        // Check if we are "going back" to the previous item in our stack
        const previousIndex = this.history.length - 2;
        if (previousIndex >= 0 && this.history[previousIndex] === url) {
          // We went back. Pop the top element (the one we just left).
          this.history.pop();
        } else {
          // We went forward (or jumped somewhere new). Push.
          this.history.push(url);
        }
      });
  }

  getCurrentUrl(): string | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  getPreviousUrl(): string | null {
    if (this.history.length < 2) return null;
    return this.history[this.history.length - 2];
  }

  /**
   * Manually remove the last entry from history.
   * Useful when performing a destructive action (like delete)
   * where you don't want the user to go "back" to the deleted page.
   */
  removeLastUrl(): void {
    if (this.history.length > 0) {
      this.history.pop();
    }
  }
}
