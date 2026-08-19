# Guía de Actualización de Variables de Entorno

Basado en los enlaces que has proporcionado, aquí tienes EXACTAMENTE qué valor copiar y pegar en cada una de tus plataformas.

> [!WARNING]
> Es crucial que copies los valores **tal cual están aquí**. Fíjate que a la URL de membresías le hemos quitado la `/` final que nos habías pasado. Ninguna URL debe terminar con `/`.
> 
> *Nota: Se ha asumido que `https://dinamyt.onrender.com` corresponde a la API de Membresías.*

---

## 1. RENDER (Tus 4 APIs principales)

En **todas las APIs** (`ecosystem-api`, `campeonatos-api`, `membresias-api` y `academy-api`), debes actualizar o agregar la siguiente variable para que los CORS funcionen correctamente con todos tus nuevos frontends:

`CORS_ORIGINS`
```text
https://dinamyt-ecosystem-portal.vercel.app,https://dinamyt-campeonatos-web.vercel.app,https://dinamyt-membresias-web.vercel.app,https://dinamyt-academy-web.vercel.app
```

Además, asegúrate de tener estas variables actualizadas en los siguientes servicios de Render:

### Campeonatos API
`ECOSYSTEM_JWKS_URL`
```text
https://dinamyt-ecosystem-api.onrender.com/auth/jwks
```

### Membresías API
`ECOSYSTEM_JWKS_URL`
```text
https://dinamyt-ecosystem-api.onrender.com/auth/jwks
```

### Academy API
`ECOSYSTEM_JWKS_URL`
```text
https://dinamyt-ecosystem-api.onrender.com/auth/jwks
```
`ECOSYSTEM_API_URL`
```text
https://dinamyt-ecosystem-api.onrender.com
```
`FIGURAS_SERVICE_URL`
```text
https://dinamyt-figuras.onrender.com
```

> **IMPORTANTE PARA RENDER**: En Render, al guardar las variables, el servicio se reinicia solo y aplica los cambios. Si no lo hace, haz un "Manual Deploy".

---

## 2. VERCEL (Tus 4 Frontends)

Ve a cada uno de tus proyectos en Vercel, entra a **Settings > Environment Variables**, edítalas copiando los valores exactos de abajo y guárdalas.
> **IMPORTANTE PARA VERCEL**: Al terminar, debes ir a la pestaña **Deployments**, hacer clic en los tres puntitos del último despliegue, y presionar **Redeploy** para que los cambios de variables tomen efecto.

### 🌐 Vercel: ecosystem-portal
`NEXT_PUBLIC_ECOSYSTEM_API_URL`
```text
https://dinamyt-ecosystem-api.onrender.com
```
`NEXT_PUBLIC_CAMPEONATOS_URL`
```text
https://dinamyt-campeonatos-web.vercel.app
```
`NEXT_PUBLIC_MEMBRESIAS_URL`
```text
https://dinamyt-membresias-web.vercel.app
```
`NEXT_PUBLIC_ACADEMY_URL`
```text
https://dinamyt-academy-web.vercel.app
```

### 🥋 Vercel: campeonatos-web
`NEXT_PUBLIC_API_URL`
```text
https://dinamyt-campeonatos-api.onrender.com
```
`NEXT_PUBLIC_ECOSYSTEM_API_URL`
```text
https://dinamyt-ecosystem-api.onrender.com
```
`NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL`
```text
https://dinamyt-ecosystem-portal.vercel.app
```
`NEXT_PUBLIC_COMBAT_WS_URL`
```text
wss://dinamyt-campeonatos-api.onrender.com
```

### 💎 Vercel: membresias-web
`NEXT_PUBLIC_API_URL`
```text
https://dinamyt.onrender.com
```
`NEXT_PUBLIC_ECOSYSTEM_API_URL`
```text
https://dinamyt-ecosystem-api.onrender.com
```
`NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL`
```text
https://dinamyt-ecosystem-portal.vercel.app
```

### 🎓 Vercel: academy-web
`NEXT_PUBLIC_API_URL`
```text
https://dinamyt-academy-api.onrender.com
```
`NEXT_PUBLIC_ECOSYSTEM_API_URL`
```text
https://dinamyt-ecosystem-api.onrender.com
```
`NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL`
```text
https://dinamyt-ecosystem-portal.vercel.app
```
