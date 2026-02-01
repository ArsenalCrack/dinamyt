import { bootstrapApplication } from '@angular/platform-browser';
import { enableProdMode } from '@angular/core';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { AuthService } from './app/core/services/auth.service';
import { inject } from '@angular/core';

enableProdMode();
bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    // Application started
  })
  .catch((err) => console.error(err));
