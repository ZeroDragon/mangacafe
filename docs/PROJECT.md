# Manga Café — Visión y decisiones

Tracker de lectura de mangas y episodios de anime. Permite saber, al abrir la app, qué series tienen novedades y cuántos capítulos/episodios faltan por ver.

---

## Objetivo de producto

Mantener un registro personal de series (manga o anime) que el usuario está siguiendo, con su URL, portada, capítulo actual y —opcionalmente— una URL de IMDB para detectar episodios nuevos automáticamente.

El dashboard debe responder en cada refresco: **"tenés N capítulos pendientes en X series"**.

## Flujo principal

1. Login (multiusuario).
2. Alta/edición de series (tipo, nombre, URL, portada, capítulo actual, URL de IMDB opcional).
3. Dashboard con refresco automático desde IMDB y conteo de pendientes.
4. Detalle de serie para ver feed y marcar como visto.

---

## Decisiones de producto (inmutables salvo consulta)

1. **Password:** migrar `md5` → `bcrypt` (Épica 2).
2. **Multiusuario** real: aislamiento estricto por `user_id`.
3. **Portada:** URL externa únicamente. Nada de subidas.
4. **Conteo de pendientes:** items nuevos (ya emitidos/publicados) no vistos del feed de la serie. Para anime vienen de IMDB; para manga, del feed RSS (Épica 9). Iterar si no alcanza.
5. **Refresco IMDB:** cada 6h en prod; on-demand en dev.
6. **Series independientes:** manga y anime son entries distintos con `type`.
7. **Errores de IMDB:** visibles en el dashboard.
8. **Feed según `type`:** anime → URL de IMDB (`imdb_url`); manga → URL de RSS/Atom (`rss_url`). Un campo u otro, nunca ambos (Épica 9).
9. **Indicador de progreso:** el "último leído/visto" es el `title` del último item visto en `series.last_read` (string, nullable), recalculado solo al marcar items visto/no-visto. `NULL` ⇒ "No data". Se elimina `current_chapter` (dato zombie) (Épica 10).
10. **Reels como tabla aparte:** los reels de FB se guardan en `reels` (no en `series`); marcar visto es por-item sin cascada; watch-later / ToDo; un único card fijo en el dashboard (Épica 11).
11. **`rss_url` acepta RSS o HTML:** el campo `series.rss_url` de un manga admite un feed RSS/Atom o la URL de la página de la serie en un sitio soportado (comivex.com al iniciar). El refresher detecta el tipo automáticamente y rutea al parser o al scraper del proveedor. Sin columna nueva: detección por contenido/host (Épica 12).
12. **Etiquetas de `type` en la UI:** la UI muestra **"Show"** para `type='anime'` y **"Graphic novel"** para `type='manga'`. Los valores internos de `series.type` (`'anime'`, `'manga'`) **no cambian** — son ids estables que persisten en la DB, se usan en queries, dispatch de feeds y clases CSS. El rename es exclusivamente cosmético (Épica 13).
13. **`source_config` para scraping genérico:** una serie `manga` puede llevar además un `source_config` (JSON, nullable) con `{ selector, url_attr, label_attr, reverse }` que describe cómo extraer los capítulos del HTML del sitio referenciado por `rss_url`. Si está presente, el refresher fetchea el HTML, lo parsea con `cheerio` (sin dependencias nuevas — ya instalado), aplica el selector + extrae los atributos + opcionalmente invierte el orden, y normaliza a `series_items`. Si está ausente, el flujo es el de Épica 12 (detección por host → comivex, o sniff → RSS). El adapter comivex no se rompe (Épica 14).
14. **Anti-bot en signup vía mCaptcha:** `POST /api/signup` requiere un `mcaptcha_token` válido emitido por `demo.mcaptcha.org` (proof-of-work SHA-256). El backend valida el token contra `/api/v1/pow/siteverify` antes de crear la cuenta. Login no se protege. Env vars: `MCAPTCHA_SITE_KEY` (público), `MCAPTCHA_SECRET_KEY` (server-side, **fail-closed** si falta). Sin tracking, sin cookies (Épica 15).

## Stack conservado

Node + Express + SQLite + Vite + Vue 3 + Vue Router + Stylus + Pug + PM2 + GitHub Actions. Ver `ARCHITECTURE.md` para el detalle.

---

## Épicas

| # | Épica | Estado | Archivo |
|---|-------|--------|---------|
| 0 | Limpieza del scaffolding | `[DONE]` | [epics/00-cleanup.md](epics/00-cleanup.md) |
| 1 | Modelo de datos (`series`, `series_items`) | `[DONE]` | [epics/01-data-model.md](epics/01-data-model.md) |
| 2 | Autenticación (bcrypt + guard + vistas) | `[DONE]` | [epics/02-auth.md](epics/02-auth.md) |
| 3 | CRUD de series | `[DONE]` | [epics/03-series-crud.md](epics/03-series-crud.md) |
| 4 | Scraper de IMDB | `[DONE]` | [epics/04-imdb-engine.md](epics/04-imdb-engine.md) |
| 5 | Dashboard de actualizaciones | `[DONE]` | [epics/05-dashboard.md](epics/05-dashboard.md) |
| 6 | Detalle de serie | `[DONE]` | [epics/06-series-detail.md](epics/06-series-detail.md) |
| 7 | Pulido y UX | `[DONE]` | [epics/07-polish.md](epics/07-polish.md) |
| 8 | Deploy e infra | `[DONE]` | [epics/08-deploy.md](epics/08-deploy.md) |
| 9 | Motor RSS para mangas | `[DONE]` | [epics/09-manga-rss.md](epics/09-manga-rss.md) |
| 10 | Indicador de "último leído" como string | `[DONE]` | [epics/10-last-read-string.md](epics/10-last-read-string.md) |
| 11 | Soporte para Facebook Reels | `[DONE]` | [epics/11-facebook-reels.md](epics/11-facebook-reels.md) |
| 12 | Auto-detección de fuente (RSS vs HTML scraper) | `[DONE]` | [epics/12-source-autodetect.md](epics/12-source-autodetect.md) |
| 13 | Reorganización del header + renombrado de tipos | `[DONE]` | [epics/13-header-menu-and-type-rename.md](epics/13-header-menu-and-type-rename.md) |
| 14 | Scraping genérico con config de usuario | `[DONE]` | [epics/14-custom-source-config.md](epics/14-custom-source-config.md) |
| 15 | Protección de signup con mCaptcha (PoW) | `[PENDING]` | [epics/15-mcaptcha-signup.md](epics/15-mcaptcha-signup.md) |

Estado de marcas: `[DONE]` completada · `[IN PROGRESS]` en curso · `[BLOCKED]` bloqueada · `[PENDING]` pendiente.

Al terminar una épica, actualizar su archivo (secciones *Tareas* con checklist y *Verificación*) y la marca en esta tabla.

---

## Cómo retomar el trabajo

1. Leé `docs/AGENTS.md` (reglas y convenciones).
2. Leé `docs/ARCHITECTURE.md` (cómo está cableado el scaffolding).
3. Mirá la tabla de épicas de arriba y abrí el archivo de la próxima `[PENDING]`.
4. Respetá las decisiones de producto; si una tarea las contradice, pará y consultá.
