import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

/**
 * La puerta de entrada del espejo. Vive en su propio módulo y no dentro de
 * `organizations` por dos razones: su prefijo es `/sync`, gemelo del que
 * Membresías expone al revés, y su guardia no es la sesión del ecosistema sino
 * el secreto compartido. Meterla en el controlador de organizaciones habría
 * puesto una ruta sin sesión en medio de treinta que sí la exigen.
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [SyncController],
})
export class SyncModule {}
