# bertcryptoSite (Viewer mínimo)

Web mínima para visualizar el contenido de `lecciones.json` (SeedYourDreams Trading School).

## Requisitos
- Node.js

## JSON (importante)
La app lee las lecciones desde:
- **VPS (recomendado):** `./data/lecciones.json`
- **Override:** variable de entorno `LECCIONES_PATH=/ruta/al/lecciones.json`
- **Dev fallback:** `../syd-trading-school-cra/syd-trading-school/src/data/lecciones.json`

Endpoints:
- `GET /api/lecciones`
- `GET /data/lecciones.json`

## Local (sin Docker)
### Instalar
```bash
cd "C:\Users\34618\clawd\memory\2ndBrain\2. Areas\1. Work\SYD\bertcryptoSite"
npm install
```

### Ejecutar
```bash
npm start
```

Luego abre:
- http://localhost:5177

## VPS con Traefik (Docker)
1) En tu VPS, copia esta carpeta y crea el JSON:
- `bertcryptoSite/docker-compose.yml`
- `bertcryptoSite/Dockerfile`
- `bertcryptoSite/server.js`
- `bertcryptoSite/public/*`
- `bertcryptoSite/data/lecciones.json`

2) Asegúrate de tener una red externa llamada `traefik` (o cambia el nombre en `docker-compose.yml`).

3) Levanta el servicio:
```bash
docker compose up -d --build
```

4) Dominio
El router está configurado para `bertcrypto.com` y `www.bertcrypto.com` en `websecure`.

Si tu Traefik usa un **certresolver**, descomenta esta label y pon el nombre correcto:
- `traefik.http.routers.bertcrypto.tls.certresolver=...`
