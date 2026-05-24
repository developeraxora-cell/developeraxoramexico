# Núcleo · Autenticación y Sesión

**Estado:** ✅ Hecho
**Archivos:** `components/Auth/LoginScreen.tsx`, `services/auth/auth.service.ts`

## Resumen
Sistema de sesión propio (no usa las sesiones de Supabase Auth). El login valida contra `app_user_profiles` mediante RPC y entrega un token propio guardado en `localStorage`.

## Funcionalidades
- Login en 2 pasos (identificador → contraseña + CAPTCHA).
- RPC `app_login_user(p_identifier, p_password)`; hash `md5(user_id::text || ':' || password)`.
- Token `lopar_session_token` en `localStorage`; validación con `app_validate_session`.
- `getCurrentUser(token)` devuelve `User` con permisos embebidos.
- Anti fuerza bruta: 5 intentos fallidos → bloqueo de 5 min (persistido en `localStorage`).
- Expiración por `sessionMinutes`; cierre con `app_logout_user`.
- Cookie de Supabase Auth (`lopar-auth-session`) separada, solo para RLS del lado DB.

## RPCs
`app_login_user`, `app_validate_session`, `app_logout_user`, `app_set_user_password`, `app_build_employee_payload`.

## Pendientes
- Ninguno funcional.
