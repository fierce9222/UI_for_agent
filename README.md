# UI для агента

Удобный интерфейс для работы с проектом и бэкендом агента. Слева дерево/список файлов, по центру вкладки с содержимым и сводкой проекта, справа панель задач/чата. Есть модальное окно настроек, которое обращается к `/api/settings`.

## Быстрый старт (Dev)
- Установите зависимости:
  - `npm i`
- Запустите бэкенд (в корне репозитория):
  - `python -m uvicorn api:app --host 0.0.0.0 --port 8000`
- Запустите UI с прокси на локальный API:
  - PowerShell: `$env:VITE_API_TARGET="http://localhost:8000"; npm run dev`
  - Bash: `VITE_API_TARGET=http://localhost:8000 npm run dev`
- Откройте `http://localhost:5173`

Конфигурация прокси берётся из `VITE_API_TARGET`, по умолчанию — `http://localhost:8000` (см. `vite.config.js`).

## Сборка через Docker
- Соберите образ UI (из каталога `UI_for_agent/`):
  - `docker build -t agent_ui .`
- Для совместного запуска UI и агента используйте `docker-compose.yml` в этом каталоге. Он ожидает образ агента с тегом `your-agent-image:latest`.

## Структура
- `index.html` — корневой HTML
- `src/App.jsx` — основной интерфейс (вкладки, список файлов, задачи, настройки)
- `src/main.jsx` — инициализация React UI
- `src/index.css` — Tailwind стили
- `vite.config.js` — dev‑сервер + прокси `/api`
- `nginx.conf` — конфиг Nginx для прод-образа (SPA + прокси `/api` → `agent:8000`)
- `docker-compose.yml` — UI + агент

## API (используются UI)
Проксируются как `/api/*` на сервис агента.
- `GET /api/files` — список файлов индекса проекта
- `GET /api/files?name=<relpath>` — содержимое файла (превью)
- `POST /api/index` — индексация проекта
- `GET /api/project` — сводка по проекту
- `GET /api/task` — состояние текущей задачи
- `POST /api/task` — старт/отмена задачи (`{"description":"..."}` или `{"cancel": true}`)
- `GET /api/plan` — получить план работ
- `POST /api/plan` — добавить/обновить пункт плана
- `GET /api/settings` — получить снимок настроек рантайма
- `POST /api/settings` — обновить допустимые параметры (опционально сохранить в `.env`)
- `GET /api/search?term=...` — поиск по проекту
- `POST /api/chat` — простой синхронный чат (attachments — опционально)
- `GET /api/chat/stream` — SSE‑поток ответов (опционально)

## Окно «Настройки»
- Открывается кнопкой «Settings» (плавающая справа снизу).
- Загружает параметры из `/api/settings` и отправляет изменения через `POST /api/settings`.
- Флажок «Persist to .env» — сохранить изменённые значения в файл `.env` бэкенда.

## Типичные проблемы
- Пустой экран в Dev:
  - Убедитесь, что API запущен на `http://localhost:8000`.
  - Запускайте Vite с `VITE_API_TARGET=http://localhost:8000`.
  - Если при первом запросе выводятся тосты об ошибке, а браузер не поддерживает `crypto.randomUUID`, у нас есть резервная генерация ID — обновите страницу.
- Сборка `npm ci` в Docker без `package-lock.json`:
  - В `Dockerfile` стоит условие: при отсутствии `package-lock.json` используется `npm install`.

## Лицензия
MIT

