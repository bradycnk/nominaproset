# FarmaNomina Pro

Aplicación web para gestión de nómina, asistencia y expedientes con Supabase.

## Requisitos

- Node.js 20+
- Proyecto Supabase activo

## Variables de entorno

Crea un archivo `.env.local` (puedes copiar `.env.example`) con:

```bash
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

## Ejecutar localmente

```bash
npm install
npm run dev
```

## Build y typecheck

```bash
npm run build
npx tsc --noEmit
```

## Supabase (backend)

Este repo incluye:
- Migraciones SQL en `supabase/migrations`
- Edge Functions en `supabase/functions`

Funciones activas:
- `create-user` (requiere JWT)
- `list-users` (requiere JWT)
- `ai-assistant` (requiere JWT)

Para que `ai-assistant` use Gemini real, configura en Supabase el secreto:

```bash
GEMINI_API_KEY=TU_API_KEY
```

Si no existe, la función responde en modo simulación.
