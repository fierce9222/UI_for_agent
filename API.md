# API для UI

Все вызовы проксируются как `/api/*` на сервис агента (`agent:8000`). Ниже перечислены эндпоинты, которые использует UI, и их соответствие реализации FastAPI в корне репозитория (`api.py`).

## Эндпоинты

- GET `/api/files` — список файлов индекса проекта
  - Ответ: `{ "files": [{ "name": string, "description"?: string, "modified"?: string }] }`

- GET `/api/files?name=<relpath>` — содержимое файла (безопасное превью)
  - Параметры: `name` — относительный путь (как в индексе)
  - Ответ: `{ "content": string }`

- POST `/api/index` — запустить индексацию проекта
  - Ответ: `{ "indexed": number, "remaining": number }`

- GET `/api/project` — краткая сводка по проекту
  - Ответ: `{ "project": { "name"?: string, "fileCount"?: number, "size"?: string, "lastIndexed"?: string }, "stats": { "active": number, "completed": number, "pending": number, "failed": number } }`

- GET `/api/task` — состояние текущей задачи агента
  - Ответ: `{ "description"?: string, "status": "pending"|"running"|"done"|"failed", "progress": number, "updatedAt"?: string, "log": string }`

- POST `/api/task` — старт или отмена задачи
  - Тело: `{ "description": string }` чтобы запустить, либо `{ "cancel": true }` чтобы отменить
  - Ответ: состояние как в `GET /api/task`

- GET `/api/plan` — получить план работ для UI
  - Ответ: `{ "plan": [{ "id": string, "title": string, "priority": "low"|"medium"|"high", "status": "planned"|"in_progress"|"done" }] }`

- POST `/api/plan` — добавить/обновить пункт плана
  - Тело: `{ "title": string, "priority"?: "low"|"medium"|"high", "status"?: "planned"|"in_progress"|"done" }` или с `id` для обновления: `{ "id": string, ... }`
  - Ответ: `{ "plan": [...] }`

## Сопоставление с агентом

Реализация на стороне агента находится в файле `api.py` (корень репозитория) и полностью покрывает все вызовы UI:

- `GET /api/files`, `GET /api/files?name` — реализовано
- `POST /api/index` — реализовано
- `GET /api/project` — реализовано
- `GET /api/task`, `POST /api/task` — реализовано (фоновый запуск и отмена)
- `GET /api/plan`, `POST /api/plan` — реализовано (хранение в `.agent/ui_plan.json`)

По умолчанию контейнер агента стартует `uvicorn api:app` на `:8000`, что соответствует настройкам `nginx.conf` и `docker-compose.yml` в каталоге UI.

