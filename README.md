# UI для агента

Автономный UI без внешних CDN, собирается Vite, отдается через Nginx, API проксируется на контейнер агента.

## Быстрый старт (Docker)

- Сборка и запуск:
  - `docker compose build`
  - `docker compose up -d`
- UI: `http://localhost:8080`
- API агента: проксируется как `/api/*` на сервис `agent:8000`

Отредактируйте `docker-compose.yml` для правильного образа агента или портов.

## Локальная разработка (опционально)

- Установите зависимости: `npm ci`
- Dev-сервер: `npm run dev` (UI на `http://localhost:5173`), прокси `/api` → `agent:8000`.

## Структура

- `index.html` — вход для Vite
- `src/App.jsx` — перенесенный код UI
- `nginx.conf` — SPA + прокси `/api`
- `Dockerfile` — multi-stage build (node → nginx)
- `docker-compose.yml` — UI + agent
