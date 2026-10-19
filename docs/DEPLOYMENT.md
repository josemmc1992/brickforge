# Ejecutar y desplegar Brickforge

**BETA · 0.3.0-beta.9.** Esta guía describe el servidor web. Para la aplicación Windows con icono e instalador, consulta [Escritorio](DESKTOP.md). El servidor sirve el editor, las geometrías y el endpoint MCP desde Node.js. Los modelos residen en SQLite. No requiere un servicio cloud ni una cuenta externa.

Si es tu primera instalación, empieza por [Requisitos e instalación paso a paso](INSTALLATION.md). Esta página desarrolla la configuración del servidor, el alojamiento y las copias de seguridad.

## Arranque local

Requiere Node.js 22.22 o posterior y npm:

```sh
npm ci
npm run build
npm start
```

Abre `http://127.0.0.1:3100`. La base se crea automáticamente vacía. No se distribuyen modelos personales ni copias de seguridad privadas.

El catálogo se distribuye completo y funciona sin consultas externas: geometrías LDraw, metadatos de conexión y perfiles mecánicos generados. Conserva los recursos de `dist/catalog` al desplegar; el servidor carga perfiles desde `dist/catalog/assembly` bajo demanda y comprueba tamaño, hash y estructura antes de utilizarlos. Su caché de perfiles aplica un presupuesto de 128 MiB; ese presupuesto no es un límite de memoria total del servicio.

`npm start`, `npm run mcp` y `npm run backup` cargan `.env` si existe en el directorio de ejecución. La invocación directa `node dist-server/stdio.mjs` no lo carga; usa variables de entorno del cliente.

## Configuración

Puedes copiar `.env.example` a `.env` y ajustar las variables. `.env` es configuración local y no debe versionarse.

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interfaz del servidor HTTP |
| `PORT` | `3100` | Puerto HTTP |
| `BRICKFORGE_DB` | `data/brickforge.sqlite` relativo a la instalación | Ruta SQLite; se recomienda absoluta |
| `BRICKFORGE_TOKEN` | Sin configurar | Clave compartida HTTP de al menos 32 caracteres |
| `PUBLIC_ORIGIN` | Sin configurar | Origen público exacto, por ejemplo `https://brickforge.example.com` |

Una ruta relativa explícita en `BRICKFORGE_DB` se resuelve desde el directorio de trabajo del proceso. Para que la web, stdio y las copias usen el mismo archivo, configura una ruta absoluta.

Sin clave, el servidor solo permite escucha local. Al escuchar fuera de loopback exige una clave de al menos 32 caracteres y `PUBLIC_ORIGIN`. Si configuras una clave también en local, se activa la autenticación.

## Node en un servidor propio

Instala dependencias y compila con los comandos anteriores. Configura estas variables mediante tu gestor de servicios o un archivo `.env` local:

```dotenv
HOST=0.0.0.0
PORT=3100
PUBLIC_ORIGIN=https://brickforge.example.com
BRICKFORGE_TOKEN=<sustituir por una clave aleatoria>
BRICKFORGE_DB=/var/lib/brickforge/brickforge.sqlite
```

Genera una clave nueva en tu equipo:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

No copies esa clave a la documentación, al repositorio ni a una URL. Usa un usuario del sistema con permiso de escritura en el directorio de datos y configura `npm start` en el gestor de procesos que elijas.

Pon el servicio detrás de un proxy HTTPS. Mantén el puerto de Node cerrado al público y haz que el proxy conserve `Host` y `Origin` del sitio externo. `PUBLIC_ORIGIN` debe coincidir con el origen del navegador; por ejemplo, los puertos forman parte del origen. El servidor comprueba `Host` y, cuando se envía, `Origin`.

La web solicita la clave y guarda una cookie HttpOnly con duración de 12 horas y `SameSite=Strict`; añade `Secure` cuando `PUBLIC_ORIGIN` usa HTTPS. El cliente MCP envía la misma clave como Bearer. Cambiar la clave e iniciar de nuevo el proceso invalida las sesiones anteriores.

Esta beta es **un único espacio de trabajo compartido**. No ofrece usuarios, roles, permisos por modelo ni OAuth. Cualquiera que tenga acceso autorizado puede modificar los modelos. El transporte stdio se controla mediante permisos del sistema operativo, no mediante la clave HTTP. Consulta también [Seguridad](../SECURITY.md).

### Comprobar el servicio

Con el servicio iniciado:

```sh
curl http://127.0.0.1:3100/healthz
```

La respuesta incluye `ok`, la versión, `storage: "sqlite"` y los transportes MCP disponibles. Comprueba también el inicio de sesión, el editor y una llamada MCP. Abrir `/mcp` en el navegador devuelve `405`, porque el endpoint utiliza `POST`.

## Docker Compose

Se incluyen un `Dockerfile` de dos etapas basado en Node.js 24 y `compose.yaml`. La imagen final ejecuta el servicio como usuario `node` y guarda SQLite en `/app/data`.

**El contenedor está configurado, pero todavía no se ha verificado en ejecución.** Valida el arranque y la persistencia en tu entorno antes de utilizarlo con datos importantes.

Define en `.env` una clave aleatoria real y el origen:

```dotenv
BRICKFORGE_TOKEN=<sustituir por una clave aleatoria de al menos 32 caracteres>
PUBLIC_ORIGIN=http://localhost:3100
```

Después:

```sh
docker compose up --build -d
docker compose logs --tail=100 brickforge
```

Compose publica el puerto en `127.0.0.1:3100`, accesible desde el host, y crea el volumen `brickforge-data`. Para desplegarlo en un dominio, cambia `PUBLIC_ORIGIN` al origen HTTPS y conecta el proxy al puerto local. Si el proxy está en otro contenedor, adapta la red de Compose para que alcance el servicio.

El volumen mantiene los modelos al recrear el contenedor. `docker compose down -v` elimina ese volumen: no lo uses si quieres conservar los datos.

## Datos, copias y restauración

Usa almacenamiento local persistente. No sitúes un SQLite activo en una carpeta de sincronización ni en un sistema de archivos de red. Mantén una sola instancia web por base; los clientes stdio locales pueden compartirla mediante el mecanismo de revisiones.

Exporta a un archivo nuevo:

```sh
npm run backup -- export copia-modelos.json
```

Importa una copia compatible:

```sh
npm run backup -- import copia-modelos.json
```

La exportación no sobrescribe archivos. El formato `brickforge-backup-v1` conserva identificadores, nombres, revisiones, piezas y fechas. La importación es transaccional: omite modelos idénticos y rechaza conflictos sin sobrescribirlos. Para restaurar una instantánea exacta, usa una base nueva y haz que todos los procesos apunten a ella.

La importación offline preserva geometrías antiguas, incluso si no cumplen las reglas de encaje actuales. Es una herramienta de migración para el administrador; las posteriores ediciones estructurales vuelven a pasar por el validador. No la utilices como sustituto de `connect_piece` para construir.

Para exportar desde Docker:

```sh
docker compose exec brickforge node dist-server/backup.mjs export /tmp/copia-modelos.json
docker compose cp brickforge:/tmp/copia-modelos.json ./copia-modelos.json
```

Para importar una copia tuya:

```sh
docker compose cp ./copia-modelos.json brickforge:/tmp/restauracion.json
docker compose exec brickforge node dist-server/backup.mjs import /tmp/restauracion.json
```

El nombre de destino de exportación debe ser nuevo en cada ejecución. Guarda las copias fuera del repositorio y prueba su restauración. No copies únicamente el archivo `.sqlite` mientras hay procesos escribiendo: SQLite utiliza también archivos WAL. Prefiere la herramienta de exportación o detén todos los procesos antes de una copia del directorio de datos.

## Actualizaciones de la beta

1. Exporta una copia y detén el servidor y los clientes stdio que lo utilicen.
2. Actualiza el código, ejecuta `npm ci`, `npm run typecheck`, `npm run catalog:check`, `npm run test:catalog`, `npm run build` y `npm test`.
3. Inicia el servicio con la misma configuración y revisa `/healthz`, los modelos y el cliente MCP.

Las pruebas utilizan bases temporales; no sustituyen una copia de tus datos. No hay sincronización automática entre instalaciones.

`npm run build` comprueba el catálogo generado. Si modificas sus fuentes o compiladores, ejecuta antes `npm run catalog:generate` y revisa los cambios; no sustituyas una comprobación fallida por una generación automática en producción. Los datos generados de una versión deben desplegarse junto con el código de esa misma versión.
