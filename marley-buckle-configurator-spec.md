# Marley's Custom Buckle Configurator

## Especificación Técnica Completa

**Proyecto:** Plataforma web de personalización de hebillas  
**Cliente:** Marley (USA)  
**Stack:** Next.js 16 (App Router) · React 19 · Fabric.js 7 · Replicate SDXL · Stripe · Resend · Upstash Redis · Cloudflare R2 · Dokploy · Tailwind CSS v4 · Shadcn/ui · Framer Motion · Auth.js v5  
**Fecha del documento:** Agosto 2026  
**Estado:** Especificación inicial (pre-implementación)  

> ⚠️ **Nota de versiones**: Este documento fue verificado contra las versiones más recientes de cada tecnología (Agosto 2026). Cambios clave respecto a versiones anteriores se documentan en cada sección.

---

## Índice

1. [Arquitectura y Decisiones Técnicas](#1-arquitectura-y-decisiones-técnicas)
2. [Requerimientos Funcionales](#2-requerimientos-funcionales)
3. [Plan de Fases y Roadmap de Implementación](#3-plan-de-fases-y-roadmap-de-implementación)
4. [Documentos Técnicos Requeridos](#4-documentos-técnicos-requeridos)
5. [Registro de Riesgos](#5-registro-de-riesgos)

---

## 1. Arquitectura y Decisiones Técnicas

### ADR-01: Next.js 16 App Router + React 19

**Decisión**: Next.js 16 (latest stable) con App Router y React 19 como framework único para frontend y backend.

**Cambios clave de Next.js 16 vs versiones anteriores:**

| Cambio | Impacto en este proyecto |
|---|---|
| **Async Request APIs** (`cookies()`, `headers()`, `draftMode()`) | Todas las APIs de request DEBEN usar `await`. Ej: `const cookieStore = await cookies()`. Aplica a layouts, pages, routes, y metadata. |
| **`unstable_cache` → `cache`** | API estabilizada. Sin prefijo `unstable_`. Para cacheo de data fetching en Server Components. |
| **PPR estable** (`experimental_ppr` removido) | Partial Prerendering es ahora feature estable. Se configura a nivel de ruta. |
| **`cacheComponents: true`** | Configuración top-level (ya no experimental). Permite cacheo granular de componentes. |
| **`partialPrefetching: true`** | Configuración top-level. Mejora navegación entre páginas. |
| **Middleware → `proxy`** | El archivo ahora se llama `proxy.ts` y exporta `proxy`, no `middleware`. Migración automática vía codemod. |
| **`next lint` removido** | Se usa ESLint CLI directamente. Biome reemplaza ESLint en este proyecto de todas formas. |
| **React 19 integrado** | App Router usa React 19 con Server Components estables, `use()` hook, `useActionState()`, `useOptimistic()`, `ref` como prop (adiós `forwardRef`). |

**Configuración Next.js 16 recomendada para este proyecto:**

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    useOffline: true,  // PWA-like offline support para catálogo
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
  },
}

export default nextConfig
```

**React 19 en detalle — hooks y patrones disponibles:**

| Feature | Uso en este proyecto |
|---|---|
| **`use()` hook** | Desenvuelve promesas en Client Components. Ideal para estado de generación IA (esperar resultado de Replicate sin Suspense manual). |
| **`useActionState()`** | Reemplaza `useFormState`. Manejo de form submissions con estados `pending`/`error` nativos. Usado en formulario de orden, login, y prompt de IA. |
| **`useOptimistic()`** | Actualizaciones optimistas de UI. Perfecto para preview de cambios de texto en el canvas del editor — el texto se muestra instantáneamente mientras el server action confirma. |
| **`ref` como prop** | `ref` ahora es una prop regular de React. Adiós `forwardRef`. Simplifica wrappers de Fabric.js y componentes de formulario. |
| **Server Components estables** | Catálogo, páginas de marketing y metadatos como Server Components por defecto. Cero JS del cliente enviado para estas páginas. |

```typescript
// Ejemplo: use() para estado de generación IA
"use client";
import { use } from "react";

function AIGenerationResult({ predictionPromise }: { predictionPromise: Promise<Prediction> }) {
  const result = use(predictionPromise);  // React 19: unwrap promise sin useEffect
  return <img src={result.output} alt="AI generated design" />;
}

// Ejemplo: useOptimistic para texto instantáneo en canvas
const [optimisticText, setOptimisticText] = useOptimistic(
  currentText,
  (_state, newText: string) => newText
);
// onInput → setOptimisticText(newValue) + Server Action en background
```

**Alternativas consideradas**:
- **Vite + Express**: Frontend y backend separados añaden superficie de API, complejidad CORS y overhead de deployment sin beneficio real para un proyecto de equipo único.
- **Remix**: Alternativa sólida pero ecosistema más pequeño para el pipeline de procesamiento de imágenes e IA.
- **Nuxt**: Ecosistema Vue sólido, pero el equipo tiene más experiencia en React y Fabric.js tiene mejores bindings para React.

**Justificación**: App Router con React 19 nos da Server Components para el catálogo (cero JS del cliente para navegación), Server Actions para mutaciones (envío de órdenes, triggers de IA), y API Routes para webhooks (Stripe, Replicate). Un solo artefacto de deployment en Dokploy. El modelo de streaming de RSC mapea directamente a nuestra UX de generación de IA.

### ADR-02: Fabric.js para Composición del Canvas

**Decisión**: Fabric.js 7.x (latest: 7.0.0) sobre HTML Canvas API, Konva, o Paper.js.

**Justificación**: El editor necesita componer cuatro capas (borde, centro IA, texto superior, texto inferior) en una sola preview estilo boceto. Fabric.js proporciona:
- Modelo de objetos para cada capa con manejo de eventos por objeto
- Edición de texto integrada con carga de fuentes, alineación y bounding boxes restringidos
- `toDataURL()` con control de resolución para el pipeline preview→producción
- **Imports nombrados**: `import { Canvas, Rect, IText } from 'fabric'` (Fabric.js v6+ usa named imports; `import { fabric } from 'fabric'` es legacy)
- Integración React vía wrapper imperativo delgado con `useRef` + `useEffect`

### ADR-03: Límite Server Components / Client Components

**Decisión**: Separar a nivel de segmento de página. Catálogo y páginas de marketing son Server Components; el configurador (canvas) y el checkout son Client Components.

```
app/
├── (marketing)/        ← Server Components (estático, crítico para SEO)
├── catalog/            ← Server Components (fetch de templates desde R2)
├── configure/[id]/     ← Límite Client Component
│   ├── page.tsx        ← Server Component shell (metadata, og:image)
│   ├── Editor.tsx      ← 'use client' — canvas Fabric.js
│   ├── AIPanel.tsx     ← 'use client' — prompt input, cola de generación
│   └── actions.ts      ← Server Actions — trigger Replicate, validar prompts
├── checkout/           ← Límite Client Component (Stripe Elements)
└── api/
    ├── webhooks/       ← Route Handlers (HTTP crudo para Stripe/Replicate)
    └── auth/
        └── [...nextauth]/
            └── route.ts  ← Auth.js v5 (export const { GET, POST } = handlers)
```

### ADR-04: Repositorio Único (No Monorepo)

**Decisión**: Un solo repositorio Next.js. Sin Turborepo/Nx.

**Justificación**: Un equipo, un deployable, DOM altamente acoplado. Dividir en paquetes añadiría overhead de build sin resolver un problema real a esta escala.

### ADR-05: Tailwind CSS v4 — CSS-First Configuration

**Decisión**: Tailwind CSS v4 con el nuevo modelo de configuración CSS-first. Sin `tailwind.config.js`.

**Cambios clave vs Tailwind v3:**
- **Sin `tailwind.config.js`**: Toda la configuración se define vía CSS con `@theme`
- **PostCSS plugin separado**: `@tailwindcss/postcss` (paquete independiente de `tailwindcss`)
- **Sin `autoprefixer` ni `postcss-import`**: Tailwind v4 los maneja automáticamente
- **Sintaxis `@theme`**: Variables de diseño, colores, fuentes, breakpoints vía CSS nativo
- **Shadcn/ui compatible**: Shadcn/ui tiene soporte para Tailwind v4

**Configuración recomendada:**

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --font-display: "Western", "serif";
  --font-body: "Inter", sans-serif;
  --color-buckle-gold: oklch(0.85 0.15 85);
  --color-buckle-silver: oklch(0.70 0.02 260);
  --color-buckle-copper: oklch(0.65 0.12 55);
  --color-buckle-leather: oklch(0.40 0.06 65);
}
```

```js
// postcss.config.mjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
```

**Justificación**: El modelo CSS-first elimina la fricción de mantener un archivo JS de configuración duplicado con conceptos de CSS. Las variables de diseño viven donde pertenecen — en CSS. El tema de Marley (colores western, tipografía display) se expresa naturalmente en este formato. Shadcn/ui con Tailwind v4 mantiene la misma experiencia de componentes que el equipo conoce.

---

### Stack Version Notes

Resumen de decisiones de versión que afectan patrones de código y configuración:

| Tecnología | Versión | Decisión Clave |
|---|---|---|
| **Next.js** | 16 (latest stable) | App Router + `proxy.ts` (no `middleware.ts`), `cache()` estable (sin `unstable_`), PPR por defecto |
| **React** | 19 | `use()`, `useActionState()`, `useOptimistic()`, `ref` como prop, Server Components estables |
| **Fabric.js** | 7.0.0 | Named imports: `import { Canvas, Rect, IText } from 'fabric'` |
| **Tailwind CSS** | v4 | CSS-first config con `@theme`, plugin `@tailwindcss/postcss`, sin `autoprefixer` |
| **Auth.js** | v5 | `auth()` para Server Components, `export const { handlers, auth, signIn, signOut }`, `auth()` wrapper en proxy |
| **Shadcn/ui** | latest (v4-compatible) | Componentes funcionan con Tailwind v4, sin cambios en API de componentes |
| **Drizzle ORM** | latest | Driver `@neondatabase/serverless` + `drizzle-orm/neon-http`, dialect `"postgresql"` |
| **Stripe** | latest | Checkout Sessions + Webhooks, idempotency keys por order ID |
| **Replicate** | latest | SDXL model, webhook-based async predictions |
| **Upstash Redis** | latest | Rate limiting (sliding window), circuit breaker para IA, cola de generaciones |
| **Resend** | latest | Email transaccional con React Email templates |
| **Cloudflare R2** | — | Object storage para templates, generaciones IA, y previews de órdenes |
| **Dokploy** | latest | Single-node deployment para Next.js |
| **Biome** | latest | Formateo + linting (reemplaza ESLint + Prettier) |
| **Neon** | — | PostgreSQL serverless como base de datos principal |

---

### Diagrama de Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTE (NAVEGADOR)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ Catálogo │  │  Editor  │  │ Checkout │  │   ErrorBoundary por  │ │
│  │  (RSC)   │  │ (Canvas) │  │(Stripe)  │  │   zona (mamparo)     │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────────────┘ │
└───────┼─────────────┼─────────────┼─────────────────────────────────┘
        │             │             │
   ┌────▼─────────────▼─────────────▼──────────────────────────────┐
   │                      NEXT.JS APP ROUTER                         │
   │                                                                 │
   │  ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐ │
│  │  Server    │  │   Server   │  │  Route   │  │   Proxy   │ │
│  │ Components │  │  Actions   │  │ Handlers │  │  (Edge)   │ │
   │  └─────┬──────┘  └─────┬──────┘  └────┬─────┘  └─────┬──────┘ │
   │        │               │              │              │         │
   │  ┌─────▼───────────────▼──────────────▼──────────────▼──────┐  │
   │  │               CAPA DE SERVICIOS (lib/services/)           │  │
   │  │  ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────┐ ┌────────┐ │  │
   │  │  │replicate │ │ stripe │ │ resend │ │ r2   │ │upstash │ │  │
   │  │  │  .ts     │ │  .ts   │ │  .ts   │ │ .ts  │ │  .ts   │ │  │
   │  │  └────┬─────┘ └───┬────┘ └───┬────┘ └──┬───┘ └───┬────┘ │  │
   │  └───────┼───────────┼──────────┼─────────┼──────────┼──────┘  │
   └──────────┼───────────┼──────────┼─────────┼──────────┼─────────┘
              │           │          │         │          │
      ┌───────▼──┐  ┌─────▼───┐ ┌────▼───┐ ┌───▼───┐ ┌───▼──────┐
      │ Replicate│  │ Stripe  │ │ Resend │ │  R2   │ │ Upstash  │
      │  (SDXL)  │  │(Pagos)  │ │(Email) │ │(Store)│ │ (Redis)  │
      └──────────┘  └─────────┘ └────────┘ └───────┘ └──────────┘

   ┌─────────── ZONAS DE MAMPARO (BULKHEAD) ───────────────────┐
   │  [Zona Catálogo]  [Zona Editor]  [Zona Checkout]  [Zona IA]│
   │   Cada zona tiene su propio ErrorBoundary, loading state,  │
   │   y ruta de degradación. Fallos no se propagan.            │
   └────────────────────────────────────────────────────────────┘
```

---

### Arquitectura de Errores (Patrón Mamparo / Bulkhead)

Cada zona funcional tiene su propio React Error Boundary con fallback específico. Un crash en el panel de IA no deja en blanco el catálogo.

```tsx
// components/editor/EditorErrorBoundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; fallback: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ZoneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ZoneBoundary] ${error.message}`, info.componentStack);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
```

#### Modos de Fallo por Zona

| Zona | Fallo | Circuit Breaker | Degradación |
|------|-------|-----------------|-------------|
| **Catálogo** | Fallo en fetch de R2 | No — retry con backoff exponencial | Mostrar grid placeholder cacheado |
| **Editor Canvas** | Fallo en init de Fabric.js | No — es del lado cliente | Fallback a imagen estática + formulario |
| **IA (Centro)** | Replicate timeout/5xx | **Sí** — 3 fallos en 60s abre breaker por 30s | "Generación IA pausada, intenta en un minuto" |
| **Checkout** | Fallo en creación de sesión Stripe | No — idempotency key protege retries | "Pago no disponible" + guardar diseño |
| **Email** | Fallo en API de Resend (no bloqueante) | No — fire-and-forget con cola de retry | Orden sigue siendo válida; admin la ve en dashboard |

#### Circuit Breaker para Replicate

```typescript
// lib/services/replicate.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const circuitBreaker = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: 'replicate:circuit',
});

export async function generateDesign(prompt: string, templateId: string) {
  const { success } = await circuitBreaker.limit('replicate');
  if (!success) {
    throw new CircuitOpenError(
      'Generación IA temporalmente no disponible. Intenta en un minuto.'
    );
  }
  // ... proceder con llamada a Replicate
}
```

---

### Flujo de Datos

#### Flujo 1: Carga del Catálogo de Templates

```
Cliente (RSC) ──► Next.js Server Component
                       │
                       ├──► R2: GET /templates/{id}/thumbnail.webp
                       │         (cacheado vía Next.js fetch cache + CDN)
                       │
                       ├──► R2: GET /templates/{id}/manifest.json
                       │         (definiciones de zonas, restricciones)
                       │
                       └──► Render grid del catálogo (server-side, solo HTML)
                                │
                                └──► Cliente recibe grid pre-renderizado
```

#### Flujo 2: Generación de Diseño con IA

```
Editor UI ──► Server Action: triggerGeneration(templateId, prompt, textTop, textBottom)
                   │
                   ├──► lib/guard/prompt.ts: validar y sanitizar prompt
                   │
                   ├──► Upstash: verificar rate-limit (3 generaciones/usuario/10min)
                   │
                   ├──► Replicate API: POST /predictions
                   │         model: stability-ai/sdxl
                   │         webhook: POST /api/webhooks/replicate
                   │
                   └──► Retornar prediction ID → mostrar skeleton en canvas
                            │
            ┌───────────────┘ (Replicate termina, dispara webhook)
            │
            ▼
Route Handler: /api/webhooks/replicate
    ├──► Verificar firma del webhook
    ├──► R2: subir imagen generada
    ├──► DB: marcar predicción como completada
    └──► Cliente: poll GET /api/predictions/{id}/status (cada 2s)
              │
              ▼
         Canvas actualiza: cargar imagen generada como capa central
```

#### Flujo 3: Envío de Orden (5 Pasos)

```
Editor → Server Action: submitOrder(designState)
              │
              ├──► Validar diseño: todas las zonas requeridas completas
              ├──► R2: subir composición final (canvas.toDataURL a 2x)
              ├──► DB: insertar orden (status: "pending_review")
              ├──► Stripe: POST /checkout/sessions
              │         idempotency_key: orderId ← evita doble cargo
              └──► Retornar { url: stripeCheckoutUrl }
                       │
              Cliente redirige a Stripe Checkout
                       │
              ┌────────┘ (pago exitoso, Stripe dispara webhook)
              │
              ▼
Route Handler: /api/webhooks/stripe
    ├──► Verificar firma de Stripe
    ├──► DB: actualizar orden → status: "awaiting_confirmation"
    ├──► Resend: email de confirmación al cliente
    ├──► Resend: notificación a Marley (admin)
    └──► Retornar 200 a Stripe
```

---

### Pipeline de Producción (Procreate → Web → Manufactura)

**Convenciones de exportación de Procreate:**
- **Canvas** (300 DPI, calidad de grabado de producción):
  - Hebilla cuadrada/ovalada: **2048×2048 px** (1:1)
  - Hebilla western apaisada: **2048×1365 px** (3:2)
- **Nombrado de capas** (obligatorio):
  - `BORDER` — capa fija de ornamentos
  - `CENTER_MASK` — silueta negra que define la zona de diseño central
  - `TOP_BANNER` — rectángulo de zona de texto superior
  - `BOTTOM_BANNER` — rectángulo de zona de texto inferior
  - `CORNER_TL`, `CORNER_TR`, `CORNER_BL`, `CORNER_BR` — acentos de esquina
- **Exportación**: Cada capa nombrada exportada como PNG individual vía Procreate → Compartir → PNG

**Pipeline de resolución:**

```
Canvas Procreate (2048px lado largo, sin pérdida)
    │
    ├──► R2: fuente resolución completa (2048px PNG) — nunca servida a clientes
    │
    ├──► R2: thumbnail (512px WebP) — grid del catálogo, lazy-loaded
    │
    ├──► Preview del editor: 1024px WebP (resolución del canvas Fabric.js)
    │
    └──► Exportación de orden: 2048px PNG (archivo de producción que Marley revisa)
              Fabric.js renderiza a 2x, exporta toDataURL({ multiplier: 2 })
```

---

### Arquitectura de Seguridad

**Autenticación**: Auth.js v5 (sucesor de NextAuth.js) con autenticación magic-link por email. Sin contraseñas que gestionar. Sesión almacenada como JWT en cookie HTTP-only (inmune a exfiltración XSS). Rol admin es un flag en el registro de usuario.

**Patrón Auth.js v5 clave**:
```typescript
// @/auth.ts
import NextAuth from "next-auth"
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [/* ... */],
})

// Server Components — obtener sesión:
const session = await auth()  // ✅ auth() directamente, NO getServerSession()

// Route handler: app/api/auth/[...nextauth]/route.ts
export const { GET, POST } = handlers

// proxy.ts — proteger rutas con auth():
export const proxy = auth((req) => {
  if (!req.auth) return Response.redirect(new URL("/login", req.url))
})
```

**Rate Limiting**:

```typescript
// proxy.ts (Edge)
// Next.js 16: middleware.ts renamed to proxy.ts, export const proxy not export default function middleware
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const aiLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '10 m'),  // 3 generaciones IA cada 10 min
});

const orderLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 h'),    // 5 órdenes por hora por IP
});

export const proxy = async (req: NextRequest) => {
  // rate limiting checks here
};
```

**Moderación de Prompts de IA**: Antes de llegar a Replicate, sanitización con lista negra de términos + prompt negativo programático:

```typescript
// lib/guard/prompt.ts
const BLOCKED_TERMS = [/* NSFW, violencia, inyección de prompts, marcas registradas */];
const MAX_PROMPT_LENGTH = 500;

export function sanitizePrompt(raw: string) {
  if (raw.length > MAX_PROMPT_LENGTH) return { blocked: true, reason: 'Prompt demasiado largo' };
  for (const term of BLOCKED_TERMS) {
    if (raw.toLowerCase().includes(term)) return { blocked: true, reason: 'Término bloqueado' };
  }
  // Reforzar estilo boceto (nunca visible al usuario)
  const safe = `${raw.trim()}, line art style, hand-drawn sketch, black and white engraving, flat 2D`;
  return { safe };
}
```

**Idempotencia de Stripe**: Cada creación de sesión de checkout usa el ID de orden como idempotency key. Si el Server Action reintenta, Stripe devuelve la misma sesión sin crear un cargo duplicado.

**Content Security Policy**:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://js.stripe.com;
frame-src https://js.stripe.com https://hooks.stripe.com;
img-src 'self' https://*.r2.cloudflarestorage.com data: blob:;
connect-src 'self' https://api.replicate.com;
style-src 'self' 'unsafe-inline';
```

---

### Consideraciones de Rendimiento

- **Catálogo**: Thumbnails 512px WebP con `Cache-Control: public, max-age=86400, immutable`. Next.js `<Image>` con `loading="lazy"`.
- **Editor**: Capas de template cacheadas en IndexedDB después de la primera carga.
- **IA**: Cold start puede tomar 10-30s. UX: botón se deshabilita → skeleton pulsante en zona central → barra de progreso → "Calentando el motor de bocetos…" → "Dibujando tu diseño…" → fade-in con Framer Motion.
- **Lazy Loading**: Catálogo carga 12 templates iniciales, resto vía Intersection Observer.

---

## 2. Requerimientos Funcionales

### Roles de Usuario y Permisos

| Acción | Anónimo | Cliente Registrado | Admin (Marley) |
|---|---|---|---|
| Navegar catálogo | ✅ | ✅ | ✅ |
| Ver detalle de template | ✅ | ✅ | ✅ |
| Usar configurador | ❌ | ✅ | ✅ |
| Guardar diseño como borrador | ❌ | ✅ (propios) | ✅ (todos) |
| Enviar diseño para revisión | ❌ | ✅ | ✅ |
| Ver órdenes propias | ❌ | ✅ | ✅ |
| Ver todas las órdenes | ❌ | ❌ | ✅ |
| Cambiar estado de orden | ❌ | ❌ | ✅ |
| Subir/gestionar templates | ❌ | ❌ | ✅ |
| Moderar prompts de IA | ❌ | ❌ | ✅ |
| Ver logs de generación IA | ❌ | ❌ | ✅ |
| Gestionar cuentas de clientes | ❌ | ❌ | ✅ |

**Registro**: Visitante → Cliente Registrado al completar verificación de email. Cuentas admin creadas manualmente por Marley (CLI o seed de DB).

**Timeouts de sesión**: Cliente: 24h de inactividad. Admin: 4h. Sesiones expiradas redirigen a login con toast "Sesión expirada".

---

### Portal del Cliente — Páginas Públicas

#### Landing Page (`/`)

- Hero section con imagen destacada de hebilla (estética boceto a mano)
- Headline: "Your Design. Your Buckle. Your Story."
- CTA: "Start Designing" → `/catalog`. Si no autenticado: "Browse Catalog" + "Sign Up to Design"
- Sección "Cómo funciona" (3 pasos visuales): Elegir template → Personalizar → Recibir
- Carrusel de templates destacados (4-6)
- Footer: contacto, Instagram, legal (Privacy, Terms, Refunds)

#### Catálogo (`/catalog`)

- **Filtros**: Estilo (Western, Military, Religious, Occupational, Floral, Geometric, Custom, Monogram)
- **Búsqueda**: Full-text en nombre, descripción, tags (debounce 300ms)
- **Orden**: Más nuevos, Más populares, A–Z
- **Grid**: 4 columnas desktop, 3 tablet, 2 mobile. Infinite scroll (12 por página).
- **Card de template**: Thumbnail (WebP lazy), nombre, tag de estilo, descripción (120 chars max)
- **Estado vacío**: "No templates match your filters. Try clearing them."
- **Estado de carga**: 8 skeleton cards

#### Detalle de Template (`/catalog/[slug]`)

- Imagen completa del template con zonas visibles/bordeadas
- Nombre, descripción, tags de estilo
- Callout: "Customizable Zones: top text, center design, bottom text, corner accents"
- Carrusel de ejemplos personalizados (3-4 mockups)
- CTA: Si autenticado → "Start Designing" → `/configurator?template=[slug]`
- CTA: Si anónimo → "Sign Up to Design" → `/register?redirect=/configurator?template=[slug]`

---

### Portal del Cliente — Autenticación

#### Registro (`/register`)
- Campos: email, password (min 8 chars, 1 mayúscula + 1 número), confirmar password
- Social login: Google OAuth
- Errores: email ya tomado, contraseña débil (validación inline en blur), passwords no coinciden

#### Verificación de Email
- Email de verificación vía Resend con magic link (expira 24h)
- Página `/verify-email`: "Revisa tu inbox. Enviamos un link a [email]." Botón "Reenviar" (rate-limited 1 por 60s)
- Cuentas no verificadas no pueden acceder al configurador ni historial de órdenes

#### Login (`/login`)
- Email + password. Checkbox "Recordarme" (extiende sesión a 30 días).
- "¿Olvidaste tu contraseña?" → `/forgot-password`
- Rate limiting: 5 intentos fallidos por email cada 15 minutos

#### Perfil (`/profile`)
- Campos: nombre completo, email (solo lectura), dirección de envío (opcional, auto-popula formulario de orden)
- Cambiar contraseña, eliminar cuenta (soft-delete, datos retenidos 30 días para cumplimiento de órdenes)

---

### Portal del Cliente — Configurador de Hebillas (`/configurator`)

Este es EL diferenciador. Cada interacción debe sentirse rápida y táctil.

#### Inicialización
- Requiere `?template=[slug]`. Sin él → redirigir a `/catalog`.
- Cargar template de R2: imagen completa del boceto, definiciones de zonas (% del canvas), fuentes disponibles, precio base
- Inicializar canvas Fabric.js con el boceto del template como capa de fondo
- Superponer rectángulos de zona (bordes semitransparentes punteados con etiquetas)

#### Sidebar de Controles (3 pestañas)

**Pestaña 1 — Texto Superior:**
- Campo de texto: máximo 25 caracteres, contador en tiempo real
- Selector de fuente: 8 fuentes aprobadas, preview renderizado en la fuente real
- Slider de tamaño: 14–72px
- Selector de color: 8 swatches predefinidos (oro, plata, negro, blanco, turquesa, rojo, cobre, navy) + hex custom
- Alineación: izquierda | centro | derecha
- Toggle Bold / Italic

**Pestaña 2 — Diseño Central (IA):**
- Campo de texto: máximo 500 caracteres, placeholder descriptivo
- Botón "Generate Designs" deshabilitado si: input vacío, excede 500 chars, sin créditos IA
- Contador de créditos: "3 generations remaining today"
- Loading state: 4 skeletons pulsantes + barra de progreso + contador de tiempo + "Generating variations..."
- Error state: "Generation failed. Please try again." (NO consume crédito)
- Resultados: 4 imágenes en grid 2×2. Click para seleccionar. Hover: overlay "Use this design"
- "Regenerate": confirmación modal "This will use a credit. You have N remaining."

**Pestaña 3 — Texto Inferior:**
- Controles idénticos al texto superior (25 chars max)

**Acentos de Esquina (si el template lo soporta):**
- Checkbox para activar/desactivar
- Dropdown de estilos: 4 opciones por template

#### Comportamiento del Canvas
- Actualizaciones en tiempo real: cada cambio de control re-renderiza la capa afectada
- Zoom: scroll wheel (escritorio), pinch-to-zoom (mobile). Rango: 50%–200%
- Pan: click-and-drag
- Botón "Reset view": 100% zoom, centrado
- Click derecho: "Save Preview as Image" (1500×1500 PNG, 72 DPI)

#### Guardar y Enviar
- "Save Draft": persiste estado a DB. Sin límite de borradores.
- "Submit for Review" → modal de preview:
  - Preview a tamaño completo del canvas
  - Resumen: nombre del template, personalizaciones, precio estimado
  - Disclaimer: "This is a preview. Marley will review your design before manufacturing."
  - "Confirm & Submit" → crea orden en `pending_review`, envía email de confirmación

---

### Portal del Cliente — Órdenes

#### Lista de Órdenes (`/orders`)
- Lista: número de orden, thumbnail del template, badge de estado, fecha, precio (si revisado)
- Ordenar: Más nuevas, Más antiguas
- Estado vacío: "No orders yet. Start designing!" → link a `/catalog`

#### Detalle de Orden (`/orders/[id]`)
- Header: número de orden (ej. `#MARL-0042`), badge de estado (color-coded)
- Preview del diseño en alta resolución
- Resumen de personalizaciones: tabla con textos, diseño central, acentos
- Timeline: stepper vertical con historial de estados
- Precio: visible solo después de que Marley lo revise

#### Notificaciones por Email (Resend)
- **Diseño enviado**: Confirmación con número de orden
- **Revisado**: Preview final inline. "Confirma para comenzar fabricación."
- **Confirmado**: "En producción. Fecha estimada: [fecha]."
- **Enviado**: "Tu hebilla va en camino. Tracking: [número]."

---

### Panel de Administración

#### Dashboard (`/admin`)
- **Métricas** (4 cards): Pendientes de revisión, En producción, Enviados este mes, Ingresos del mes
- **Actividad reciente**: Últimos 20 eventos (órdenes, registros, generaciones IA)
- **Acciones rápidas**: "Revisar pendientes", "Subir template", "Ver uso de IA"

#### Gestión de Órdenes (`/admin/orders`)
- **Filtros**: Estado, rango de fechas, búsqueda por cliente, orden
- **Tabla**: Orden #, Cliente (nombre + email), Template, Estado (badge), Fecha, Acciones
- **Detalle de orden** con flujo de cambio de estado:
  1. `pending_review` → `awaiting_confirmation`: Marley revisa, define precio final. Envía email "Revisado".
  2. `awaiting_confirmation` → `confirmed` → `in_production`: Cliente confirma → a producción.
  3. `in_production` → `shipped`: Requiere número de tracking + carrier.
  4. Cancelación: posible antes de `shipped`, requiere motivo.
- **Acciones en lote**: Seleccionar múltiples → cambiar estado
- **Creación manual de orden**: Para clientes por teléfono/email
- **Notas internas**: Textarea con log cronológico por orden

#### Gestión de Templates (`/admin/templates`)
- **Lista**: Thumbnail (64×64), Nombre, Tags, Estado (Activo/Inactivo), Envíos, Acciones
- **Subir nuevo template**:
  - Nombre, descripción (500 chars), tags de estilo, precio base
  - Imagen del boceto (PNG/WebP, min 1500×1500px)
  - Definición de zonas visual (drag-and-drop de rectángulos sobre preview)
  - Fuentes disponibles, colores disponibles
  - Imágenes de ejemplo (2-4 mockups)
- **Editar**: Mismo formulario pre-rellenado. Cambiar zonas NO afecta órdenes existentes.
- **Activación**: Templates inactivos no aparecen en catálogo.

#### Moderación de IA (`/admin/ai-moderation`)
- **Cola de prompts marcados**: Lista de prompts detectados por filtro de contenido
- **Acciones**: Aprobar (falso positivo), Rechazar (bloquea prompt), Bloquear Cliente (deshabilita IA)
- **Lista negra de palabras**: Añadir/eliminar términos. Matching case-insensitive.
- **Logs de generación**: Timestamp, cliente, prompt (truncado), modelo, estado, costo, duración
- **Seguimiento de costos**: Total generaciones del mes, costo total, costo promedio, proyección

#### Gestión de Clientes (`/admin/clients`)
- **Lista**: Nombre, Email, Fecha de registro, Total órdenes, Última actividad, Estado
- **Detalle**: Perfil, órdenes, actividad, notas internas
- **Acciones**: Deshabilitar cuenta, Resetear créditos IA
- **Creación manual**: Para clientes que ordenan por teléfono

---

### Requerimientos No Funcionales

#### Rendimiento
| Métrica | Objetivo | Medición |
|---|---|---|
| Page load (LCP) | < 3s | Lighthouse en catálogo, configurador, detalle de orden |
| Render inicial del canvas | < 500ms | Desde fetch de template hasta canvas listo |
| Generación IA | < 30s | Desde click hasta 4 imágenes visibles (progreso visible en < 2s) |
| Time to Interactive | < 4s | Lighthouse en configurador |
| API response time (p95) | < 200ms | Endpoints GET server-side |

#### Accesibilidad (WCAG 2.1 AA)
- Todos los elementos interactivos: navegables por teclado, focus ring visible (2px, alto contraste)
- Contraste de color: texto 4.5:1 mínimo, texto grande 3:1 mínimo
- Formularios: `<label>` asociados, errores linkeados vía `aria-describedby`
- Canvas: región aria-live debajo con estado actual ("Texto superior: 'TEXAS' en dorado. Diseño central: longhorn generado por IA.")
- Skip-to-content link como primer elemento enfocable
- Todas las imágenes con alt text. Imágenes IA usan prompt como alt text.

#### Seguridad
- HTTPS forzado (HSTS header)
- Passwords hasheados con bcrypt (cost factor 12)
- Cookies: httpOnly + Secure + SameSite=Strict
- CSRF: SameSite cookies + token header en endpoints de mutación
- Rate limiting Upstash: login 5/15min, IA 20/día, API 100/min por IP
- File uploads: max 10MB, validación MIME type (PNG, WebP), escaneo server-side
- PCI: NUNCA almacenar, procesar o transmitir datos de tarjeta (Stripe maneja todo)

#### Escalabilidad
- 100 sesiones simultáneas de configurador sin degradación (canvas es client-side)
- Cola de IA: Upstash Redis. Máx 10 requests concurrentes a Replicate. 1000 generaciones/día.
- Conexiones DB: pool min 5, max 20.
- Assets estáticos: R2 con CDN caching (max-age=86400 templates, 3600 generaciones)

---

## 3. Plan de Fases y Roadmap de Implementación

### Fase 0: Fundación (Semana 1–2)

Antes de CUALQUIER feature, levantar el esqueleto. Nada en esta fase llega a clientes — pero saltarse algo aquí genera deuda que se multiplica en cada sprint siguiente.

#### Entregables

- **Scaffold del proyecto**: Next.js App Router + TypeScript + Tailwind CSS v4 + Shadcn/ui + Drizzle ORM
- **Base de datos**: PostgreSQL (Neon serverless) con Drizzle. Driver: `@neondatabase/serverless` + `drizzle-orm/neon-http`. Schemas para `users`, `accounts`, `templates`, `template_zones`, `orders`, `ai_generations`. Migraciones y seed data.
  ```typescript
  // lib/db/index.ts — patrón de conexión Drizzle + Neon
  import { drizzle } from "drizzle-orm/neon-http";
  import { neon } from "@neondatabase/serverless";
  const sql = neon(process.env.DATABASE_URL!);
  export const db = drizzle({ client: sql });
  // Para transacciones: usar drizzle-orm/neon-serverless con Pool
  ```
  ```typescript
  // drizzle.config.ts
  import type { Config } from "drizzle-kit";
  export default {
    schema: "./lib/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: { url: process.env.DATABASE_URL! },
  } satisfies Config;
  ```
- **Auth esqueleto**: Auth.js v5 con Google OAuth + Credentials. Export: `handlers`, `auth`, `signIn`, `signOut`. Server Components usan `const session = await auth()`. `proxy.ts` protege `/admin/*` con `auth()` wrapper.
- **CI/CD**: GitHub Actions (lint → type-check → test → build). Deploy automático a preview en Dokploy en push a main.
- **Variables de entorno**: `.env.example` documentado. Secrets en GitHub Secrets + Dokploy.
- **Code quality**: Biome (formateo + linting). Lefthook pre-commit hooks. Commitlint (conventional commits).
- **Docs**: `README.md` (setup local, arquitectura, contribución). `CONTRIBUTING.md` (branches, PR template).

#### Criterios de Salida
- `pnpm dev` funciona y muestra la página default de Next.js
- Login con Google OAuth funcional
- `pnpm db:push` crea todas las tablas; `pnpm db:seed` popula templates
- CI pasa en un PR trivial
- Dokploy muestra la app corriendo en preview

---

### Fase 1: Catálogo MVP (Semana 3–4) — VENDE DESDE EL DÍA UNO

Primer incremento desplegable. Un cliente descubre un template, llena un formulario, paga, y recibe confirmación. Marley ve la orden en admin. Sin configurador ni IA — flujo de "boceto a mano, revisión humana" que valida el modelo de negocio antes de construir lo complejo.

#### Entregables

**Catálogo público (Semana 3)**
- Landing page (`/`): Hero, value proposition, carrusel de templates, FAQ, footer
- Catálogo (`/catalog`): Grid de templates con filtros (categoría, búsqueda). Paginación cursor-based.
- Detalle de template (`/catalog/[slug]`): Imagen full-width, descripción, precio, CTA → auth gate

**Flujo "Request Design" (formulario sin editor)**
- Formulario multi-paso: (1) confirmar template, (2) textos, (3) descripción del centro + upload de referencia, (4) datos de contacto
- Validación con Zod schemas compartidos
- Creación de orden con status `pending_review`

**Integración de Pagos**
- Stripe Checkout: precio fijo del template. Webhook handler con verificación de firma.
- Email de confirmación vía Resend con número de orden y preview.

**Admin Panel MVP**
- Dashboard: métricas básicas (órdenes del día, pendientes, ingresos del mes)
- Gestión de órdenes: tabla con filtro por estado, detalle, cambio de estado con notificaciones
- Gestión de templates: upload, editar, activar/desactivar (definición de zonas diferida a Fase 2)

**Responsive**: Mobile 320px, Tablet 768px, Desktop 1280px+. Admin con sidebar colapsable.

#### Criterios de Salida
- Flujo de checkout completo: navegar → seleccionar → formulario → pagar → confirmación email
- Admin puede ver orden, cambiar estado, y cliente recibe notificación
- Admin puede subir, editar y togglear templates
- Lighthouse: Performance ≥ 80, Accessibility ≥ 90, SEO ≥ 90

---

### Fase 2: Configurador Visual (Semana 5–7)

EL diferenciador. Reemplaza el formulario "Request Design" con un editor canvas real. Clientes ven su hebilla en forma de boceto mientras escriben, eligen fuentes y posicionan texto. Sin IA aún — el centro sigue siendo placeholder o imagen de referencia subida.

#### Entregables

**Canvas Engine (Semana 5)**
- Integración Fabric.js: componente React wrapper. Canvas con dimensiones del template.
- Sistema de zonas: definidas en admin como % del canvas. Zonas cargan objetos interactivos (IText para texto, Image para centro).
- Text overlay: selector de fuente (8-10 fuentes curadas), size slider (12-72px), color picker (20 swatches + hex). Todo en tiempo real.

**Interacción y Estado (Semana 6)**
- Preview en tiempo real: cada cambio < 50ms. Undo/redo (20 pasos).
- Borradores: auto-save a localStorage cada 5s. "Save Draft" persiste a DB. Página "My Designs".
- Mobile: touch events para drag y pinch-to-zoom. Teclado no oculta objetos de texto.

**Editor de Zonas Admin (Semana 7)**
- UI visual: cargar template, dibujar rectángulos de zona (drag, resize, delete). Panel de propiedades por zona.
- Validación: sin solapamiento, dentro de bordes. Preview con texto de muestra.
- Guardado como JSONB en `templates.zones`.

#### Criterios de Salida
- Cliente abre configurador, escribe texto, cambia fuentes/colores, ve preview en tiempo real
- Borradores persisten entre sesiones
- Admin define zonas visualmente
- Canvas a 30fps+ durante operaciones de drag en desktop

---

### Fase 3: Generación con IA (Semana 8–9)

Generación del diseño central vía Replicate SDXL. Donde el producto se vuelve genuinamente único — cada hebilla tiene un centro generado por IA que coincide con el prompt del cliente y la estética boceto del template.

#### Entregables

**Pipeline de IA (Semana 8)**
- Integración Replicate SDXL: API call con parámetros controlados (prompt + sufijo de estilo "sketch style, black and white line art, belt buckle center design, clean lines, no color", negative prompt "photorealistic, 3D render, color, shading, gradient, background, text, watermark", guidance scale 7-10, steps 30-50)
- Generación multi-variante: 3-4 predicciones en paralelo. Grid en canvas. Cliente selecciona o regenera.
- Almacenamiento: upload a R2. Presigned URL 1h. Limpieza de variantes no usadas a 72h.
- Validación de prompts: Zod schema + moderación de contenido + lista negra en Redis

**UX Polish (Semana 9)**
- Loading states: skeleton secuencial → "Generating..." con progreso → grid con fade-in
- Sistema de créditos: 5 créditos gratis al registrarse. Paquetes de créditos vía Stripe. Tabla `ai_credits`. Débito atómico, rollback en fallo.
- Rate limiting: Upstash sliding window. 10 generaciones/usuario/hora, 50/IP/día.

#### Criterios de Salida
- Cliente ingresa prompt, ve 3-4 diseños generados en <60s
- Créditos decrementan correctamente. Créditos gratis y pagos funcionan.
- Rate limiting previene abuso. Moderación de prompts detecta violaciones obvias.
- Limpieza automática de generaciones no usadas en R2

---

### Fase 4: Flujo Completo de Órdenes (Semana 10–11)

El pipeline de aprobación de 5 pasos que conecta la herramienta creativa con la cola de manufactura.

#### Entregables

**Workflow de Aprobación (Semana 10)**
- Envío de diseño: Canvas state serializado como JSON. Preview renderizado server-side. Orden creada con `design_snapshot` JSONB.
- Dashboard de revisión admin: Cola de diseños pendientes. Vista side-by-side (preview + textos + prompt). Botones: Aprobar, Solicitar Cambios, Rechazar.
- Re-confirmación del cliente: Email con preview y link "Confirm Your Design". Página de confirmación con preview final. Bloquea diseño.

**Pipeline de Órdenes (Semana 11)**
- Generación de PDF: Al confirmar, PDF con preview + especificaciones de texto + diseño central standalone + referencia de template
- Timeline de estados: Componente stepper en detalle de orden del cliente. Transiciones con timestamp.
- Automatización de emails: Templates de Resend para cada transición. Contenido dinámico (order ID, preview, instrucciones). Tracking de aperturas/clicks.
- Historial de órdenes: Portal cliente y admin con búsqueda, filtros, acciones en lote.

#### Criterios de Salida
- Flujo completo de 5 pasos: enviar → admin revisa → aprueba → cliente confirma → cola de producción
- PDF se genera correctamente con todas las especificaciones
- Cada cambio de estado dispara el email correcto al destinatario correcto

---

### Fase 5: Polish y Production Readiness (Semana 12)

Sprint final de endurecimiento. Sin features nuevas — exclusivamente hacer rápido, accesible, observable y resiliente lo que ya existe.

#### Entregables

- **Rendimiento**: `Next/Image` con `sizes` y `priority`. R2 con Cloudflare CDN. Bundle analysis. LCP < 2.5s, INP < 200ms.
- **Error boundaries**: `error.tsx` a nivel de ruta para catálogo, configurador, órdenes, admin. Recuperación de crash de Fabric.js. Mensajes de error de Replicate amigables.
- **Accesibilidad**: Auditoría con `axe-core` y Lighthouse. Focus indicators, ARIA labels en canvas, navegación por teclado, screen reader announcements, contraste ≥ 4.5:1.
- **SEO**: `generateMetadata` en páginas públicas. `sitemap.xml`, `robots.txt`. Structured data (Product schema). Admin y rutas de usuario `noindex`.
- **Analytics**: PostHog — funnel del configurador, tiempo por paso, conteo de generaciones. Eventos de pipeline de órdenes.
- **Backup & DR**: R2 Cross-Region Replication. `pg_dump` nightly a R2. Procedimiento de restore documentado y probado.
- **Load testing**: Artillery/k6 simulando 50 navegadores de catálogo, 10 sesiones de configurador, 5 generaciones IA, 20 checkouts. Target: p95 < 500ms, cero errores.
- **Launch checklist**: SSL, CSP headers, rate limiting, idempotencia Stripe, SPF/DKIM/DMARC, cuentas admin, error tracking (Sentry/Rollbar), health check público.

#### Criterios de Salida
- Lighthouse ≥ 90 en los 4 rubros
- Cero violaciones críticas o altas de axe-core
- Load test pasa a 2x del tráfico pico esperado
- Restore de backup documentado y demostrado
- Launch checklist firmado por al menos dos miembros del equipo

---

## 4. Documentos Técnicos Requeridos

Cada documento aquí previene un desacuerdo, un ciclo de retrabajo o una semana perdida. Escríbelos antes de escribir código.

| Documento | Alcance | Por Qué Importa |
|---|---|---|
| **System Architecture Document** | Diagrama de componentes, flujo de datos entre servicios, límites de red, topología de deployment en Dokploy | Un diagrama reemplaza 50 hilos de Slack |
| **Database Schema & ERD** | Schema completo de Drizzle con tablas, columnas, tipos, constraints, índices, relaciones. Estrategia de migraciones | El schema ES el modelo de negocio. Ambigüedad aquí = corrupción de datos después |
| **API Contract** | Cada Route Handler, Server Action y endpoint: método, path, auth, request body (Zod), response, errores. Incluye contrato de webhooks de Stripe y Replicate | Frontend y backend trabajan en paralelo contra este contrato |
| **AuthN & AuthZ Model** | Roles, matriz de permisos, estrategia de sesión, refresh de tokens, política de impersonación admin | Decisiones de seguridad tomadas una vez, no redescubiertas en code review |
| **Fabric.js Zone Protocol** | Schema JSON de zona (type, bounds, constraints, defaults). Mapeo a objetos canvas. Versionado. Spec de serialización | Un formato de zona mal diseñado rompe todos los templates retroactivamente |
| **AI Generation Spec** | Construcción de prompts, rangos de parámetros, pipeline de moderación, atomicidad de débito de créditos, taxonomía de errores | La IA es el centro de costo y el diferenciador. Parámetros descontrolados queman créditos |
| **Payment & Order State Machine** | Diagrama completo de estados de `orders.status`. Transiciones automáticas vs manuales. Efectos secundarios por transición. Estrategia de idempotency key | El dinero fluye por esta máquina de estados. Un webhook perdido o race condition cuesta dólares reales |
| **Email Communication Plan** | Cada email transaccional: trigger, destinatario, template ID (Resend), variables dinámicas, fallback, política de unsubscribe | Email es el canal primario de comunicación con el cliente |
| **Testing Strategy** | Alcance de tests unitarios, integración, e2e. Herramientas (Vitest, Playwright). Objetivos de cobertura | Testear sin estrategia es esfuerzo desperdiciado |
| **Deployment & Infra Runbook** | Configuración Dokploy, variables de entorno por ambiente, estructura de buckets R2, Redis, backup schedule, rollback, contactos de incident response | Cuando producción está caída a las 2 AM, nadie quiere leer código. Quieren un runbook |

---

## 5. Registro de Riesgos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | **Brecha de expectativas IA** — SDXL no logra la estética boceto, produce artefactos o fuga fotorrealista | **Alta (60%)** | **Crítico** | Prompt engineering desde Fase 1 en sandbox. 50+ pares prompt/output. Criterios pass/fail ANTES de exponer a usuarios. Image-to-image con crop de zona como init. Post-procesamiento (filtro sketch) como fallback. 2 semanas extra en Fase 3 solo para tuning de prompts. |
| 2 | **Complejidad de integración de pagos** — Confiabilidad de webhooks Stripe, race conditions, casos borde de reembolsos, tax en múltiples jurisdicciones | **Media (40%)** | **Alto** | Idempotencia desde día uno. Tabla `stripe_events` para replay/debug. Stripe test mode clock para simular edge cases. Precio flat sin tax en Fases 1-3. Spike de 2 días en edge cases de webhooks. |
| 3 | **Pipeline Procreate→web** — Bocetos a mano tienen canvases, DPI y transparencias inconsistentes. Export batch manual y propenso a errores. Zonas desalineadas. | **Media (50%)** | **Alto** | Spec rígida de template: 2048×2048 (cuadrada) o 2048×1365 (western), 300 DPI, PNG transparencia, capa plana. Script de normalización (sharp) en upload. Visual diff en admin. Documento iPad export workflow (1-pager PDF en el repo). |
| 4 | **Rendimiento bajo carga** — Re-renders de canvas en mobile, saturación de rate limits de Replicate, costos de bandwidth de R2 | **Baja (25%)** | **Medio** | Fabric.js: `renderOnAddRemove: false` + batching. Debounce 100ms en input de texto. Rate limiting Upstash. Cola si excede límite concurrente de Replicate. CDN en front de R2. Load test a 5x en Fase 5. |
| 5 | **Precisión de definición de zonas** — Zonas definidas por admin derivan entre templates o tras reemplazo de imagen. Coordenadas incorrectas = texto y centro desalineados. | **Media (35%)** | **Medio** | Coordenadas basadas en % (no px absolutos). Grid overlay + snap-to-grid en editor de zonas. Preview con texto de muestra. Versionado de zonas: diseños activos referencian versión específica. Reemplazo de imagen fuerza re-validación. |

---

## Resumen del Timeline

| Fase | Duración | Equipo | Estado |
|---|---|---|---|
| Fase 0: Fundación | 2 semanas | 1-2 engineers | No deployable |
| Fase 1: Catálogo MVP | 2 semanas | 2 engineers | **Deployable — vende** |
| Fase 2: Configurador Visual | 3 semanas | 2 engineers | Deployable |
| Fase 3: IA | 2 semanas | 2 engineers | Deployable |
| Fase 4: Workflow Completo | 2 semanas | 2 engineers | Deployable |
| Fase 5: Production Ready | 1 semana | Todo el equipo | Lanzamiento |

**Total: 12 semanas a producción.** Agresivo pero factible con contratos claros, pair programming en componentes de alto riesgo, y cero scope creep durante las fases.

---

*Documento generado como especificación técnica inicial para el proyecto Marley's Custom Buckle Configurator. Debe ser revisado y aprobado por todas las partes antes de comenzar la Fase 0.*

---

## Versiones Verificadas

Verificación de versiones contra las últimas estables — Agosto 2026.

| Tecnología | Versión Verificada | Fecha de Verificación | Notas |
|---|---|---|---|
| **Next.js** | 16.x (latest stable) | Aug 2026 | `proxy.ts`, `cache()`, PPR estable |
| **React** | 19.x | Aug 2026 | Server Components estables, `use()`, `useActionState()`, `useOptimistic()` |
| **Fabric.js** | 7.0.0 | Aug 2026 | Named imports: `import { Canvas } from 'fabric'` |
| **Tailwind CSS** | v4.x | Aug 2026 | CSS-first config, `@tailwindcss/postcss` |
| **Auth.js** | v5.x | Aug 2026 | `auth()` para Server Components, `handlers` export |
| **Shadcn/ui** | latest (v4-compatible) | Aug 2026 | Compatible con Tailwind v4 |
| **Drizzle ORM** | latest | Aug 2026 | Driver: `@neondatabase/serverless` |
| **Neon** | serverless | Aug 2026 | PostgreSQL serverless, conexión via HTTP |
| **Upstash Redis** | latest | Aug 2026 | Rate limiting + circuit breaker |
| **Stripe** | latest API (2025-26) | Aug 2026 | Checkout Sessions, idempotency keys |
| **Replicate** | latest API | Aug 2026 | SDXL model, webhook predictions |
| **Resend** | latest | Aug 2026 | Email transaccional, React Email templates |
| **Cloudflare R2** | — | Aug 2026 | S3-compatible object storage |
| **Dokploy** | latest | Aug 2026 | Single-node Docker deployment |
| **Biome** | latest | Aug 2026 | Linting + formatting (reemplaza ESLint/Prettier) |
