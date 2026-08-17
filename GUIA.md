# Guía de uso — Marley Buckles (beta)

Todo lo que necesitas para prender, apagar y usar el proyecto. Si algo falla, casi siempre está
resuelto en la sección **Cuando algo falla** al final.

---

## Accesos

### Panel de administración (Marley)

- **URL:** http://localhost:3000/admin
- **Usuario:** `marley@local.test`
- **Contraseña:** `marley1234`

Esta contraseña es solo para desarrollo local y está en el seed (`db/seed.ts`). **Antes de poner
esto en internet hay que cambiarla** — ver *Cambiar la contraseña* más abajo.

### Tienda (clientes)

- **URL:** http://localhost:3000
- No hay que iniciar sesión. El diseño en curso se guarda con una cookie firmada del navegador,
  así que un diseño solo se puede abrir desde el navegador donde se creó.

### Otras direcciones útiles

| Qué | Dónde |
| --- | --- |
| Correos de prueba (MailHog) | http://localhost:8025 |
| Base de datos (Drizzle Studio) | `npm run db:studio` |
| Postgres | `localhost:5434`, usuario `marley`, contraseña `marley`, base `marley` |

---

## Prender el proyecto

Desde la carpeta del proyecto (`Desktop/marley`), en dos pasos:

```bash
docker compose up -d    # base de datos y correo de prueba
npm run dev             # la aplicación
```

Luego abre http://localhost:3000. Tarda unos segundos la primera vez.

> Si es la **primera vez** en esta computadora, antes de `npm run dev` corre también:
> `npm install`, después `npm run db:migrate` y `npm run db:seed`.

## Apagar el proyecto

```
Ctrl + C          # detiene la aplicación (en la terminal donde corre)
docker compose down
```

`docker compose down` **no borra los datos**: los modelos, zonas y diseños quedan guardados en un
volumen de Docker y siguen ahí la próxima vez. Solo `docker compose down -v` los borraría.

---

## Recorrido de la beta

1. **Tienda** → http://localhost:3000/catalog
2. Entra a *Classic Rope Border* → **Start designing**
3. Vas por cuatro pasos, con la hebilla dibujándose en vivo a la izquierda:

   | Paso | Qué se hace |
   | --- | --- |
   | Wording | Texto de arriba y de abajo, curvado sobre el metal |
   | Corners | Adornos en cada esquina (cada uno suma al precio) |
   | Centre design | Describes el diseño **o subes una foto**, y eliges entre las propuestas |
   | Your buckle | El dibujo final en trazo negro, que es con el que trabajaría Marley |

4. **Panel** → http://localhost:3000/admin — crear modelos, arrastrar las zonas sobre la hebilla,
   y definir qué fuentes y adornos permite cada zona.

### Sobre la generación con IA

- Cada clic en *Generate* produce **2 imágenes** y cuesta unos **$0.10** de la cuenta de OpenAI.
- Tarda **entre 1 y 3 minutos**. La pantalla lo avisa con un contador; no está trabada.
- Límite: **8 imágenes por diseño cada 24 horas** (4 clics).
- Para probar la interfaz **sin gastar dinero**, arranca en modo simulado y salen dibujos de
  prueba en vez de llamar a OpenAI:

  ```powershell
  $env:AI_PROVIDER = "mock"; npm run dev     # PowerShell
  ```

  ```bash
  AI_PROVIDER=mock npm run dev               # Git Bash
  ```

  Para volver al modo normal en PowerShell: `$env:AI_PROVIDER = ""` (o cierra la terminal).

---

## Cambiar la contraseña de admin

La contraseña se guarda cifrada (bcrypt), no en texto plano, así que no se puede cambiar
editando la base a mano. Hay que borrar el usuario y volver a crearlo con el seed.

**En PowerShell:**

```powershell
docker exec marley-postgres psql -U marley -d marley -c "delete from admin_users;"

$env:SEED_ADMIN_EMAIL = "tu@correo.com"
$env:SEED_ADMIN_PASSWORD = "una-contraseña-larga"
npm run db:seed
```

**En Git Bash:**

```bash
docker exec marley-postgres psql -U marley -d marley -c "delete from admin_users;"
SEED_ADMIN_EMAIL="tu@correo.com" SEED_ADMIN_PASSWORD="una-contraseña-larga" npm run db:seed
```

El seed no toca los modelos ni los diseños existentes, solo vuelve a crear el usuario.

---

## Cuando algo falla

### La página no carga o sale error 500

Casi siempre es que el servidor lleva días encendido y sus procesos internos murieron. Se
arregla reiniciándolo limpio. Detén la app con `Ctrl + C` y luego:

```powershell
Remove-Item -Recurse -Force .next\dev    # en PowerShell
npm run dev
```

```bash
rm -rf .next/dev                          # en Git Bash
npm run dev
```

Borrar `.next/dev` limpia la caché de compilación. Es seguro: se regenera sola.

### "Another next dev server is already running"

Solo puede haber una instancia. O usas la que ya está corriendo, o la cierras: el mensaje te da
el comando exacto (`taskkill /PID <número> /F`).

### El catálogo aparece vacío

Se perdieron los datos de ejemplo. Recupéralos con:

```bash
npm run db:migrate && npm run db:seed
```

### La generación con IA dice que no está configurada

Falta la clave de OpenAI en `.env.local` (línea `OPENAI_API_KEY=`), o hay otra variable
`OPENAI_API_KEY` en el sistema tapándola — **PostHog Desktop exporta una**. Si arrancas el
servidor desde tu propia terminal no pasa. El error lo dice claramente cuando ocurre.

### La base de datos no conecta

Revisa que el contenedor esté arriba: `docker ps`. Si no aparece `marley-postgres`, corre
`docker compose up -d`.

Ojo: el Postgres de este proyecto usa el puerto **5434**, no el 5432 — porque en esta
computadora el 5432 lo tiene el PostgreSQL instalado en Windows y el 5433 el proyecto
`jolt-links`.

---

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Arranca la aplicación |
| `npm run db:seed` | Recrea el usuario admin y el modelo de ejemplo |
| `npm run db:studio` | Ver y editar la base de datos en el navegador |
| `npm run test:e2e` | Corre las 23 pruebas automáticas (apaga `npm run dev` primero) |
| `npm run typecheck` | Verifica que no haya errores de tipos |
| `npm run build` | Compila la versión de producción |

---

## Qué falta

La beta **no cobra**: no hay carrito, ni pagos, ni pedidos. Fue una decisión, para poder ver
primero si la idea funciona.

Si algún día quieres cerrar el ciclo, lo que falta —y **no necesita pagos**— es que el cliente
pueda *enviarle* el diseño a Marley y que ella lo revise y apruebe.

Dos cosas por confirmar con Marley cuando llegue el momento: si su fabricante necesita archivo
vectorial (SVG/DXF) o le basta una imagen de alta resolución, y la política de envíos.

**El arte del modelo de ejemplo es provisional** (el cordoncillo se ve como puntitos y los
adornos son círculos con letras). Cuando tengas las fotos o dibujos reales de las hebillas de
Marley, se suben desde el panel y no hay que tocar código: son datos, no programa.
