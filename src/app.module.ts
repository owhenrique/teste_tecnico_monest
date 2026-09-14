import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { CepModule } from './modules/cep/cep.module.js';
import { envOf, loadEnv } from './shared/env/env.js';
import { Env } from './shared/env/env.schema.js';
import { buildLoggerOptions } from './shared/logger/logger.options.js';
import { SentryRequestIdMiddleware } from './shared/sentry/sentry-request-id.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
      validate: loadEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => buildLoggerOptions(envOf(config)),
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SentryRequestIdMiddleware).forRoutes('*');
  }
}
