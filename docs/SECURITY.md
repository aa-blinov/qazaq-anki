# Security audit

Последний аудит: 2026-08-15. Этот документ фиксирует, что проверено, что
уже сделано, и что считается **out of scope** для текущей версии.

## Внешние сканеры

| Сканер | Вердикт | Команда |
|--------|---------|---------|
| `npm audit` (root, prod) | **0 уязвимостей** | `npm audit --omit=dev` |
| `npm audit` (server, prod) | **0 уязвимостей** | `cd server && npm audit --omit=dev` |
| `npm audit` (root, all) | **0 уязвимостей** | `npm audit` |
| `npm audit` (server, all) | **0 уязвимостей** | `cd server && npm audit` |

## Что уже сделано

### Аутентификация
- **bcrypt 10 rounds** для хэширования паролей (~80 ms на один verify)
- Bearer-токены в `Authorization` header, **не** cookies — нет CSRF surface
- Токены — 32-байтные случайные hex-строки из `crypto.randomBytes`
- Пароли не логируются, не возвращаются в API-ответах
- Username normalization + regex (`^[a-z0-9_]{3,32}$`) — отсекает инъекции в URL

### Авторизация
- Все защищённые маршруты проходят через `requireAuth`
- Запросы к `/api/cards` (user cards) ограничены `ownerUserId = ?`
- `GET /api/progress`/`PUT /api/progress/...` — **строго** per-user (composite PK `(userId, cardId, direction)`)
- `POST /api/reset` — обнуляет **только свои** данные, не чужие

### SQL-инъекции
- **Все запросы** идут через prepared statements с `?`-плейсхолдерами
- DDL (миграции) — фиксированные строки, без пользовательского ввода
- Проверено: ни одного `db.exec()` или `db.run()` со string concatenation, кроме миграций

### HTTP security headers (Express)
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
Permissions-Policy: geolocation=(), camera=(), microphone=()
```

### HTTP security headers (nginx, prod)
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
Permissions-Policy: geolocation=(), camera=(), microphone=()
Strict-Transport-Security: max-age=31536000; includeSubDomains   (только для https)
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

### Rate limiting
- `/api/auth/register` — 5 попыток / 10 мин на IP
- `/api/auth/login` — 10 попыток / 5 мин на IP
- 429 + `Retry-After` при превышении
- Ключ — IP из `X-Forwarded-For` (первый hop), с fallback на `req.ip`

### Защита от DoS
- JSON body limit: **256 KB**
- `MAX_USERS=500` — лимит на количество аккаунтов
- bcrypt автоматически делает login verify медленным

### CORS
- По умолчанию `origin: true` (echo origin из запроса) — для dev
- В проде **обязательно** выставить `CORS_ORIGIN=https://your-domain.com`

### Зависимости
- Только 4 prod-зависимости в server: `bcryptjs`, `cors`, `express`, `sql.js`
- Только 3 prod-зависимости в web: `react`, `react-dom`, `react-router-dom`, `lucide-react`
- `npm audit` чист в обеих папках

### Прочее
- Нет `eval`, `new Function`, `dangerouslySetInnerHTML`, `innerHTML` в нашем коде
- Нет `exec`/`spawn`/child_process — нечем запускать shell-команды
- Все секреты — в env (`DB_PATH`, `CORS_ORIGIN`, `PORT`), дефолты безопасные
- `.env` файлы в `.gitignore`, `.dockerignore` не пропускает их в image

## Out of scope (для текущей версии)

Эти штуки **намеренно** не реализованы — сервис рассчитан на маленькую
аудиторию (≤ 500 пользователей), а не на публичный SaaS:

- **2FA / TOTP** — нет email-инфраструктуры
- **Password reset** — нет email, юзернейм уникальный и одноразовый
- **CAPTCHA** — bcrypt + rate limit достаточно для 500 юзеров
- **Аудит-логин** — логируется только в `console.log` API
- **Distributed rate limiting** — лимиты per-process, не кластерные
- **WAF / Cloudflare** — на пользователе, наш код ничего не фильтрует
- **Per-account lockout** — есть только per-IP лимит
- **CSRF tokens** — не нужны, токены не в cookies
- **Helmet** — реализован вручную (те же 4 заголовка), чтобы не тащить лишнюю зависимость
- **CSP nonce/hash** — для простоты `script-src 'self'` (без inline) работает, т.к. бандл — обычные `<script src>`. Если когда-нибудь понадобится inline — добавим nonce

## Регулярные проверки

При каждом обновлении зависимостей:
```bash
npm audit
cd server && npm audit
```

Перед релизом:
1. Прогнать `npm test` (83 unit-теста)
2. Прогнать `npm run e2e` (29 e2e-тестов)
3. Проверить `CORS_ORIGIN` в env
4. Снять бэкап БД
