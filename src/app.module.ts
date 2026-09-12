import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { CepModule } from './modules/cep/cep.module.js';
import { loadEnv } from './shared/env/env.js';
import { buildLoggerOptions } from './shared/logger/logger.options.js';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: () => buildLoggerOptions(loadEnv(process.env)),
    }),
    CepModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ transform: true, whitelist: true }),
    },
  ],
})
export class AppModule {}
