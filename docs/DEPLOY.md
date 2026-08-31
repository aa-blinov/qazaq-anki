# Деплой

Этот сервис — два Docker-контейнера:
- **`qazaq-api`** — Node 22 + Express + SQLite (sql.js)
- **`qazaq-web`** — nginx, отдаёт собранный фронт + проксирует `/api/*` на API

БД живёт в named volume `qazaq-data`, переживает перезапуск контейнеров и `docker compose down` (но **не** `docker compose down -v` — смотри раздел "Бэкапы").

## Подготовка

1. Скопируй `.env.example` (если будет) или создай свой `.env` рядом с `docker-compose.yml`:
   ```env
   CORS_ORIGIN=https://qazaq.example.com
   PORT=3001
   DB_PATH=/data/qazaq.sqlite
   ```
   `CORS_ORIGIN` — список origin'ов через запятую, **обязательно** поменяй перед прод-деплоем, иначе любой сайт сможет ходить к твоему API.

2. Собери образы:
   ```bash
   docker compose build
   ```
   Это займёт ~2 минуты в первый раз. Дальше — инкрементально.

3. Подними:
   ```bash
   docker compose up -d
   ```
   Проверь, что оба контейнера healthy:
   ```bash
   docker compose ps
   ```

4. Открой `http://your-host:8080`. Должна открыться лендинг-страница.

## За nginx с TLS (рекомендуется)

`deploy/nginx.conf` отдаёт фронт и проксирует API. Для публичного HTTPS поставь перед ним **Caddy** или **Traefik** с автоматическим Let's Encrypt — это самый простой путь. Пример с Caddy:

```caddyfile
qazaq.example.com {
    reverse_proxy localhost:8080
}
```

Caddy сам получит и обновит сертификат. Запускай его **вне** docker-compose (на хосте) или добавь отдельным сервисом.

## Где хостить

| Провайдер | Плюсы | Минусы | Цена |
|-----------|-------|--------|------|
| **Hetzner VPS** (falkenstein/helsinki) | EU-локации рядом с СНГ, root, дешёво | ручная настройка | €3.79/мес (CX22) |
| **Oracle Cloud Free Tier** | бесплатно навсегда (ARM) | сложно зарегистрироваться, регион может быть далеко | $0 |
| **Fly.io** | `fly launch` и готово, есть volume | привязка к платформе | free tier есть |
| **Render** | есть free web service, Docker | free засыпает через 15 мин idle | $7/мес за always-on |
| **Aéza / Timeweb Cloud (KZ)** | серверы в Алматы/Астане, оплата в тенге/рублях | меньше контроля, чуть дороже | от ~1500 ₸/мес |

**Рекомендация**: если хостишь для друзей/учеников и важна скорость в Казахстане — **Aéza/Timeweb с локацией Almaty**. Если европейская аудитория — **Hetzner Helsinki**. Если "хочу бесплатно" — **Oracle Free Tier** или **Fly.io**.

## Бэкапы SQLite

БД — один файл `qazaq-data:/data/qazaq.sqlite`. Чтобы снять бэкап **без остановки сервиса**:

```bash
docker compose exec qazaq-api sqlite3 /data/qazaq.sqlite ".backup /data/backup-$(date +%F).sqlite"
docker compose cp qazaq-api:/data/backup-YYYY-MM-DD.sqlite ./backups/
```

(Нужен `sqlite3` внутри контейнера; сейчас его нет — добавь `apt-get install -y sqlite3` в `server/Dockerfile` либо делай бэкап через `cp` при остановленном API. Для личного использования остановка на 1 секунду приемлема.)

Автоматизируй cron'ом:
```cron
0 4 * * * cd /opt/qazaq && docker compose stop qazaq-api && cp qazaq-data/qazaq.sqlite backups/$(date +\%F).sqlite && docker compose start qazaq-api
```

## Миграции БД

При первом запуске `db.js` создаёт таблицы и применяет миграции (`schema_meta.version` идёт от 1 к 3). Миграции идемпотентны — повторный запуск на уже обновлённой БД ничего не делает.

## Логи

```bash
docker compose logs -f qazaq-api   # API
docker compose logs -f qazaq-web   # nginx
```

## Обновление

```bash
git pull
docker compose build
docker compose up -d
```

БД и пользовательские карточки переживают обновление. Если поменялась схема БД — миграция отработает при старте API автоматически.

## Troubleshooting

**401 на все запросы после деплоя**
- Проверь, что в `CORS_ORIGIN` указан origin, с которого заходишь (включая схему `https://`).
- В дев-консоли `localStorage.getItem('qazaq.token')` — токен должен быть.

**БД не пишется**
- Убедись, что volume `qazaq-data` создан (`docker volume ls | grep qazaq`).
- Права: контейнер работает под `node` (uid 1000), volume должен быть ему доступен.

**502 от nginx**
- API не успел подняться — `docker compose logs qazaq-api`. Healthcheck должен поймать это сам, но в первый раз после рестарта может быть момент.
