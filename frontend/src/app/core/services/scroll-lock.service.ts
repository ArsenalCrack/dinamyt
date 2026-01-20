import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private lockCount = 0;
  private prevOverflow: string | null = null;
  private prevPaddingRight: string | null = null;

  lock(): void {
    this.lockCount++;
    if (this.lockCount !== 1) return;

    const body = document.body;
    this.prevOverflow = body.style.overflow;
    this.prevPaddingRight = body.style.paddingRight;

    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollBarWidth > 0) {
      body.style.paddingRight = `${scrollBarWidth}px`;
    }
  }

  unlock(): void {
    if (this.lockCount <= 0) {
      this.lockCount = 0;
      return;
    }

    this.lockCount--;
    if (this.lockCount !== 0) return;

    const body = document.body;
    body.style.overflow = this.prevOverflow ?? '';
    body.style.paddingRight = this.prevPaddingRight ?? '';

    this.prevOverflow = null;
    this.prevPaddingRight = null;
  }
}
