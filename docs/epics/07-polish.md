# Épica 7 — Pulido y UX

**Estado:** `[PENDING]`
**Objetivo:** Cerrar la experiencia con estados vacíos, loaders, filtros, búsqueda, responsive y PWA.

**Depende de:** Épicas 3, 5, 6 (features base).
**Habilita:** release usable.

---

## Alcance

### UX
- Skeleton loaders mientras cargan series, dashboard y feeds.
- Estados vacíos claros en cada pantalla.
- Filtros en dashboard: todos / manga / anime / con pendientes / con error.
- Búsqueda local por nombre de serie.
- Toasts/feedback para acciones (creado, editado, eliminado, error de RSS).

### Responsive
- Layout mobile-first; el menú lateral actual ya fue removido, diseñar nav nuevo.
- Tarjetas reflow en pantallas chicas.

### PWA
- El `public/site.webmanifest` ya existe; revisar name/icons.
- Considerar service worker para offline del dashboard (caché de GET).

---

## Tareas

- [ ] Diseñar header/nav consistente (logo, dashboard, agregar serie, logout).
- [ ] Componente `<Loader>` / skeleton reutilizable.
- [ ] Componente `<Toast>` para feedback.
- [ ] Filtros y búsqueda en `Dashboard.vue`.
- [ ] Revisar `site.webmanifest` (nombre "Manga Café", icons, theme color).
- [ ] Auditoría de contraste/accesibilidad básica (labels en inputs, focus visible).
- [ ] Probar en viewport mobile real (DevTools).

## Verificación

- [ ] Sin series, el dashboard muestra CTA claro.
- [ ] Filtros cambian la lista sin recargar.
- [ ] Búsqueda filtra por nombre en tiempo real.
- [ ] Layout no rompe en 360px de ancho.
- [ ] Iconos y manifest válidos (Lighthouse PWA check).

## Notas

- Postergar service worker si complica el deploy; el `dotPathFixPlugin` ya da SPA fallback.
- Iconos Material Symbols ya cargados — usarlos para nav y acciones.
