import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

import { CepModule } from './modules/cep/cep.module.js';

@Module({
  imports: [CepModule],
  providers: [
    {
      // Registrado no módulo, e não via app.useGlobalPipes, para que os testes e2e
      // exercitem a mesma configuração de validação que roda em produção.
      provide: APP_PIPE,
      useValue: new ValidationPipe({ transform: true, whitelist: true }),
    },
  ],
})
export class AppModule {}
