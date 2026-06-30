import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

function buildCorsValidator() {
  // Lista de origins exatas (ex: http://localhost:5173)
  const exactOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Subnets permitidas — formato "192.168.170/23" ou "192.168.170"
  // Cada entrada é verificada como prefixo dos primeiros octetos do hostname
  const subnets = (process.env.CORS_SUBNETS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/\d+$/, '')) // remove /23, /24 etc.
    .filter(Boolean);

  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Sem origin = Postman, curl, mobile — libera
    if (!origin) return callback(null, true);

    // Verifica match exato
    if (exactOrigins.includes(origin)) return callback(null, true);

    // Verifica subnet
    if (subnets.length > 0) {
      try {
        const hostname = new URL(origin).hostname;
        const octets = hostname.split('.').map(Number);

        for (const subnet of subnets) {
          const subnetOctets = subnet.split('.').map(Number);
          // Compara os octetos definidos na subnet (ignora os restantes)
          const match = subnetOctets.every(
            (octet, i) => !isNaN(octet) && octets[i] === octet,
          );
          if (match) return callback(null, true);
        }
      } catch {
        // origin malformado — bloqueia
      }
    }

    console.warn(`[CORS] Bloqueado: ${origin}`);
    callback(new Error(`CORS não permitido para: ${origin}`));
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: buildCorsValidator(), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: false, transform: true }));
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`PGD backend rodando em http://${host}:${port}/api`);
}
bootstrap();
