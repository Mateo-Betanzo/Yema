# EggManagement

App móvil para vender huevos a domicilio. Los clientes arman su pedido, eligen una franja de entrega y pagan en efectivo al recibir. El dueño del negocio (el único admin) gestiona pedidos, catálogo, stock y reparto, y ve cuánto vende.

> **Estado:** v1 completa. Cuentas con confirmación de email por código, recuperación de contraseña e inicio de sesión con Google (en la web y en Android; en iOS con Expo Go, pendiente); tienda, carrito y pedidos con franja de entrega; catálogo, stock y agenda de reparto para el admin; dashboard con historial y resumen del día con IA.

## Funcionalidades de la v1

**Cliente**
- Crea su cuenta con nombre, apellido, teléfono, dirección (con referencias para el repartidor), email y contraseña.
- Tienda con filtros *Todos / Maples / Packs / Media docena*, detalle de cada producto y carrito con el total.
- Elige una franja de entrega y paga en efectivo al recibir.
- Home con el pedido en curso y su línea de estados, "Volver a comprar" y el historial por fecha.
- Puede cancelar mientras el admin no aceptó el pedido. Tiene un solo pedido activo a la vez.

**Admin**
- Home con ingresos de hoy, pedidos con entrega para hoy y pedidos por entregar. Cada pedido se abre en un modal para aceptarlo o rechazarlo, marcarlo en camino o entregado, cancelarlo con un motivo, y llamar o escribir por WhatsApp al cliente.
- Dashboard con lo recaudado en la semana y el mes, ventas por tipo, inventario restante e historial de ventas con buscador.
- Productos: tipos, formatos (huevos por formato), precios y carga de stock con historial.
- Agenda de reparto (días y franjas) y venta manual de mostrador.

**Fuera de la v1:** Mercado Pago, recuperación de contraseña, zonas de entrega, alerta de stock bajo, notificaciones push, escaneo de PDF o foto de recargas y modo claro.

## Stack
- Expo SDK 58, React Native, TypeScript estricto y `expo-router`. Se prueba en **Expo Go** (iOS y Android); la versión web no está soportada.
- [Supabase](https://supabase.com): Auth, Postgres con Row Level Security, funciones SQL y Realtime. La seguridad y los cálculos (precios, stock, totales) viven en la base, no en la app.
- TanStack Query para leer y escribir datos de Supabase (caché, carga, error e invalidación).
- `jest-expo` y Testing Library para los tests de la app; pgTAP para los de la base.

## Requisitos
- Node.js y npm (se desarrolló con Node 24).
- Docker, para correr Supabase en tu máquina.
- La app **Expo Go** en el teléfono, en una versión que soporte el SDK 58. Expo Go solo abre el último SDK.

## Configurar Supabase
1. Levantá Supabase local (la primera vez descarga las imágenes de Docker):
   ```bash
   npx supabase start
   ```
   Al terminar muestra la URL de la API, la publishable key y la URL de Studio (el panel local).
2. Copiá `.env.example` como `.env.local` en la raíz (git lo ignora) y completalo. Usá la IP de tu computadora en la red, no `127.0.0.1`, porque el teléfono tiene que poder llegar (en Linux, `hostname -I`; en macOS, `ipconfig getifaddr en0`):
   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=http://<IP-de-tu-computadora>:54321
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key que mostró el paso 1>
   ```
   Si la perdiste, `npx supabase status` la vuelve a mostrar. La app solo usa estas dos variables: nunca pongas la secret key ni la service role key.
3. Aplicá las migraciones: `npx supabase db reset` (borra los datos locales y recrea la base). Los tests de la base corren con `npx supabase test db`.

   En local, los emails de Auth (el código para confirmar el email al registrarse y el de "¿Olvidaste tu contraseña?") no salen a internet: llegan a **Mailpit**, en `http://127.0.0.1:54324`. Las plantillas están en `supabase/templates/`. "Continuar con Google" no se puede probar en local (Google no acepta volver a la IP de tu red): se prueba con la app apuntando a la nube (paso 5).
4. Creá el admin:
   1. Registrate en la app con **Crear cuenta**, como cualquier cliente, con el email que va a usar el admin, y escribí el código de 6 dígitos que llega a ese email (en local, a Mailpit).
   2. En Studio (`http://127.0.0.1:54323`), abrí el *SQL Editor* y ejecutá:
      ```sql
      update public.profiles set role = 'admin'
      where id = (select id from auth.users where email = '<email-del-admin>');
      ```
   3. Cerrá la app del todo y volvé a abrirla: el rol nuevo se aplica al abrirla (o cerrá sesión y entrá de nuevo).

   La app no permite crear admins ni cambiar un rol, y nadie puede cambiarlo desde la API: solo con SQL desde el panel.
5. Producción (un solo proyecto en la nube):
   1. Vinculá el proyecto y subí las migraciones: `npx supabase link --project-ref <ref>` y `npx supabase db push`.
   2. Configurá Auth igual que en local (`supabase/config.toml`), en el panel de `https://supabase.com/dashboard/project/<ref>/auth/…`:
      - **Providers → Email:** *Confirm email* **activado**, contraseña mínima de **8** con **letras y números**, y el código de **6** dígitos que vence en **3600** s.
      - **SMTP:** un Gmail propio de la app con verificación en 2 pasos y una contraseña de aplicación (`https://myaccount.google.com/apppasswords`): host `smtp.gmail.com`, puerto `587`, usuario y remitente ese Gmail, nombre `Yema`. Después, en **Rate Limits**, el envío de emails en 100 por hora y 60 s por usuario. Sin SMTP propio, Supabase solo le manda emails al equipo del proyecto.
      - **Email Templates:** *Confirm sign up* y *Reset password* con el asunto y el contenido de `supabase/templates/confirmation.html` y `recovery.html` (el código `{{ .Token }}`, sin enlaces). El asunto de cada una está en `config.toml`.
      - **Providers → Google:** el *Client ID* y el *Client Secret* de un cliente OAuth *Aplicación web* de Google Cloud (Google Auth Platform → Clients), con el *Callback URL* que muestra esa pantalla como URI de redireccionamiento autorizado y los permisos `openid`, `email` y `profile`. La app de Google queda en modo prueba: solo entran con Google los emails cargados como usuarios de prueba (hasta 100); publicarla pide una página y una política de privacidad con dominio propio.
      - **URL Configuration:** *Site URL* `yema://` y *Redirect URLs* `exp://**` (Expo Go) y `yema://**`.

      `npx supabase config diff` muestra si quedó algo distinto; no uses `config push` sin revisar el diff, porque también subiría valores locales como `site_url`. El secreto de Google y la contraseña de Gmail van solo en el panel: nunca en la app ni en el repo.
   3. Creá el admin como en el paso 4, con la app apuntando al proyecto de la nube y el *SQL Editor* de su panel.

## Cómo correr la app
1. Instalá las dependencias: `npm install` (para agregar paquetes nuevos se usa `npx expo install <paquete>`).
2. Iniciá el servidor de desarrollo: `npx expo start`.
3. Abrí **Expo Go** y escaneá el código QR (en iOS, con la Cámara). El teléfono y la computadora tienen que estar en la misma red.

Otros comandos: `npx tsc --noEmit` (typecheck), `npm run lint`, `npm test` y `npx supabase test db` (tests de la base).

## Estructura del repositorio
```
.
├── supabase/              migraciones, tests SQL, datos de prueba y Edge Functions
├── src/app/               pantallas (rutas de expo-router: (auth), client/, admin/)
├── src/                   lib/ (Supabase), logic/ (funciones puras), components/, theme/
├── tests/                 tests de la app
└── assets/                íconos y splash
```

