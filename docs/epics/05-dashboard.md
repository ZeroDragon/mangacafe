# Épica 5 — Dashboard de actualizaciones

**Estado:** `[PENDING]`
**Objetivo:** Pantalla principal post-login que, al montarse/refrescarse, muestra qué series tienen novedades y cuántos capítulos/episodios faltan por ver.

**Depende de:** Épicas 1, 3 (series), 4 (RSS poblado). Puede construirse con datos parciales si 4 está en curso.
**Habilita:** cierre del flujo principal del producto.

---

## Alcance

### Backend
- `GET /api/dashboard` (protegido) → para cada serie del usuario:
  ```json
  {
    "series": { ...campos de series, incluyendo last_error },
    "hasUpdates": true|false,
    "pendingCount": 3,
    "lastItemTitle": "Capítulo 47",
    "lastItemDate": 1780000000
  }
  ```
- Puede disparar un refresco on-demand antes de responder (flag `?refresh=1`), o asumir que el scheduler de Épica 4 ya actualizó.

### Frontend
- `Dashboard.vue` reemplaza al placeholder `home.vue` como ruta protegida `/dashboard` (o `/`).
- Sección de resumen: "Tenés N capítulos pendientes en X series".
- Lista de `SeriesCard` con badge de pendientes y flag de error.
- Acción "Marcar como visto" que avanza `current_chapter` y marca items `seen=1`.
- Auto-fetch al montar (resuelve "cada vez que se refresca la pantalla").

---

## Tareas

- [ ] `GET /api/dashboard` que arme el agregado (JOIN `series` + conteo de `series_items`).
- [ ] Decidir si dispara refresh automático o delega al scheduler. Recomendado: no bloquear el render; el scheduler corre aparte y el dashboard lee lo último.
- [ ] `Dashboard.vue` con `SeriesCard.vue` (reutilizable de Épica 3).
- [ ] Resumen total arriba (sum de pendientes, nº de series con novedades).
- [ ] Destacar series con `last_error` (icono + tooltip con el mensaje).
- [ ] Botón "marcar todo visto" / "marcar visto hasta aquí" por serie.
- [ ] Botón global "refrescar ahora" que llama a `POST /api/refresh` y recarga datos.
- [ ] Loading state mientras refresca.
- [ ] Estado vacío (sin series → CTA a agregar; series sin pendientes → mensaje positivo).

## Verificación

- [ ] Con series y items pendientes, el resumen muestra el total correcto.
- [ ] Series con `last_error` muestran el error visible.
- [ ] "Marcar como visto" reduce el `pendingCount` y avanza `current_chapter`.
- [ ] Recargar la página (F5) re-ejecuta el fetch y el conteo es consistente.
- [ ] Series de otro usuario no aparecen.

## Notas

- El "refresh al cargar" debe ser rápido: el dashboard no debe esperar al refresco RSS completo si este es lento. Mejor leer estado actual y dejar que el scheduler actualice en background; mostrar `last_checked_at` para contexto.
- Considerar websocket/SSE para updates en vivo más adelante (fuera de scope).
