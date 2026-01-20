import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { AuthService } from './app/core/services/auth.service';
import { inject } from '@angular/core';

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    console.log('🚀 Application started successfully');
  })
  .catch((err) => console.error(err));
