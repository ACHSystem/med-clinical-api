# Operación: logs, request ID y métricas

## Variables de entorno

| Variable | Requerida | Default | Uso |
| --- | --- | --- | --- |
| `LOG_LEVEL` | No | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `METRICS_TOKEN` | No | — | Si falta, `GET /api/metrics` responde `404` |

## Request ID

- Se acepta `x-request-id` si cumple `[A-Za-z0-9._-]{1,64}`.
- Si no viene o es inválido, se genera un UUID.
- Se devuelve en el header `x-request-id` y en el cuerpo de los errores.
- Se propaga al log, a la auditoría y a las métricas.

## Logs estructurados

Formato JSON con `pino`:

```json
{
  "level": 30,
  "time": "2026-10-28T05:18:06.908Z",
  "service": "med-clinical-api",
  "requestId": "9db15fc0-8cf9-444b-b20f-c643dc9a5906",
  "method": "POST",
  "path": "/api/services-costs/dolar",
  "statusCode": 201,
  "durationMs": 12,
  "userId": "2675307b-...",
  "clinicId": "15cc905d-..."
}
```

Errores 500 incluyen además `errorName`, `errorMessage` y `stack` **solo del lado servidor**.
El cliente recibe `Error interno del servidor`.

### Qué nunca se registra

- `Authorization`, cookies, tokens o contraseñas.
- Body de la petición.
- `MedicalHistory.data`, `vitalSigns`, `notes`, diagnóstico, síntomas u observaciones.
- Email, teléfono, dirección o cédula del paciente.

## Métricas

Endpoint: `GET /api/metrics`

```bash
curl -H "x-metrics-token: $METRICS_TOKEN" http://localhost:3000/api/metrics
```

Métricas:

| Métrica | Tipo | Labels |
| --- | --- | --- |
| `http_requests_total` | Counter | `method`, `route`, `status` |
| `http_request_duration_seconds` | Histogram | `method`, `route` |
| `http_errors_total` | Counter | `method`, `route`, `status` |

`route` usa el nombre del handler (por ejemplo `getPatients`), no la URL con IDs, para
evitar cardinalidad alta. Los rechazos de guard se contabilizan con `route="guard"`.

Se incluyen las métricas por defecto de Node (`process_*`, `nodejs_*`).

## Alertas sugeridas

- Tasa de `5xx` > 1% durante 5 minutos.
- p95 de `http_request_duration_seconds` > 1 s durante 10 minutos.
- Aumento de `429` (posible ataque o límite mal dimensionado).
- Caída de `up` del scrape de Prometheus.

## Ejemplo de scrape

```yaml
scrape_configs:
  - job_name: med-clinical-api
    metrics_path: /api/metrics
    static_configs:
      - targets: ['med-clinical-api:3000']
    headers:
      x-metrics-token: 'cambiar-por-token-largo'
```

## Apagado

`main.ts` llama `enableShutdownHooks()`; `PrismaService.onModuleDestroy()` cierra el pool.
En despliegues rolling, esperar a que el proceso termine antes de matar la instancia.
