# Requisitos e instalación de Brickforge

**BETA · 0.3.0-beta.12 — diseña LEGO con IA.** Esta guía parte de un equipo sin Brickforge instalado. Puedes usar el editor manualmente y conectar después un asistente de IA mediante MCP.

**Si quieres abrir Brickforge desde un icono en Windows, empieza por la [guía de la aplicación de escritorio](DESKTOP.md).** Sus ejecutables incluyen los requisitos de ejecución: no necesitan Node.js, npm ni Git instalados. Los pasos con Node de esta página sirven para la versión web y para desarrollar desde el código.

## 1. Elige cómo ejecutarlo

| Opción | Instala en tu equipo | Estado de verificación |
| --- | --- | --- |
| Escritorio Windows x64 | Instalador por usuario o ejecutable portable; entorno incluido | Beta; consulta alcance y comprobaciones en la guía de escritorio |
| Node en Windows | Node.js y npm; Git si clonas el repositorio | Arranque y pruebas de la aplicación verificados |
| Node en macOS/Linux | Node.js y npm; Git si clonas el repositorio | Pasos preparados; ejecución aún no verificada |
| Docker | Docker Engine y Docker Compose v2, o Docker Desktop | Configuración incluida; contenedor aún no verificado en ejecución |

Para uso de escritorio en Windows, utiliza el instalador o el portable. Para ejecutar la web o trabajar con el código, sigue la instalación con Node de esta página. Docker es una alternativa para alojar la web: no necesitas instalar todos los métodos.

## 2. Requisitos de la versión web y del desarrollo

- **Node.js 22.22 o posterior** para la instalación directa. Recomendamos **Node.js 24 LTS**. Descarga el instalador o sigue las instrucciones oficiales para tu sistema en [nodejs.org](https://nodejs.org/en/download). Los instaladores oficiales incluyen npm.
- **Git**, solo si vas a clonar o actualizar desde el repositorio. Instálalo desde [git-scm.com](https://git-scm.com/install/). Si utilizas un ZIP, puedes omitirlo.
- **Navegador actualizado con WebGL 2** y gráficos habilitados para abrir el visor 3D. También necesita la API de descompresión gzip `DecompressionStream` para cargar las piezas. WebGL 1 no es suficiente. El servidor y el proceso MCP stdio pueden funcionar sin abrir un navegador.
- **Conexión a Internet** para descargar código y dependencias durante la instalación. Después, el editor y las geometrías funcionan localmente; la conexión que requiera tu proveedor de IA depende de ese proveedor.
- **Permiso de escritura** en la carpeta del proyecto o en la ruta SQLite configurada, y **puerto 3100 libre** para el servidor web. No necesitas permisos de administrador para ejecutar la aplicación en una carpeta tuya.
- **Espacio para el catálogo, dependencias, compilación y modelos**. El catálogo incluye geometrías, metadatos de conexión y archivos de perfiles mecánicos; reserva espacio adicional para la compilación y tus datos. No se ha medido un mínimo de disco, RAM o GPU que garantice un rendimiento concreto.
- **Cliente compatible con MCP**, solo para construir con IA: debe admitir stdio o Streamable HTTP. Brickforge no incluye un modelo de IA ni exige una cuenta de un proveedor determinado. Los requisitos y posibles costes de tu cliente o proveedor son independientes.

**No tienes que instalar SQLite, Python, PostgreSQL ni una base de datos externa.** Se utiliza el módulo SQLite integrado en Node.js. Tampoco se requiere una GPU dedicada para ejecutar un modelo de IA dentro de Brickforge: no se ejecuta ninguno; el navegador sí necesita poder representar la escena 3D.

Después de instalar Node y Git, cierra y vuelve a abrir la terminal para actualizar el PATH. Comprueba:

```sh
node --version
npm --version
git --version
```

`node --version` debe mostrar al menos `v22.22.0`; se recomienda la rama 24 LTS. Git solo es necesario si eliges clonar. En PowerShell puedes usar `npm.cmd --version` para evitar el script `npm.ps1`.

## 3. Descargar el proyecto

### Con Git

Desde la carpeta donde quieras guardar el proyecto:

```sh
git clone https://github.com/josemmc1992/brickforge.git
cd brickforge
```

### Desde un ZIP

Descarga el ZIP del código desde el repositorio o usa el paquete de distribución de la beta. **Descomprímelo completamente** en una carpeta tuya y abre una terminal dentro de la carpeta que contiene `package.json`, `package-lock.json`, `README.md` y `INICIAR.cmd`. El nombre puede ser `brickforge` o `brickforge-main`, según el origen del ZIP.

No ejecutes la aplicación desde el visor de archivos comprimidos. No se distribuyen modelos personales: una instalación nueva empieza con una base vacía.

El código incluye el catálogo generado, sus metadatos LDCad y sus perfiles de colisión y encaje. No necesitas descargar otro catálogo ni regenerarlo para instalar la aplicación. Conserva todos los archivos de `public/catalog`: la ejecución normal utiliza esos recursos locales.

## 4. Instalar y arrancar con Node

### Windows — PowerShell

Dentro de la carpeta del proyecto, ejecuta cada comando y continúa solo si termina correctamente:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

La primera orden instala las dependencias, la segunda genera la aplicación y la tercera arranca el servidor. El arranque es correcto cuando aparece `Brickforge ready` con la dirección local.

La compilación verifica también la integridad y vigencia del catálogo. Si indica que está desactualizado, comprueba que has descargado una versión completa y coherente del código; si estás desarrollando cambios en sus fuentes, sigue el flujo `catalog:generate` → `catalog:check` → `test:catalog` de [Contribuir](../CONTRIBUTING.md).

No uses `npm ci --omit=dev` antes de compilar: las herramientas de compilación también deben instalarse.

Abre [http://127.0.0.1:3100](http://127.0.0.1:3100). **Deja la terminal abierta**; para detenerlo pulsa **Ctrl+C**.

Como alternativa, puedes hacer doble clic en `INICIAR.cmd` o ejecutar `./INICIAR.cmd`. Este archivo instala dependencias y compila si faltan las carpetas correspondientes, y mantiene el servidor en su ventana. Node y npm deben estar instalados antes. Para reconstruir tras cambios de código, utiliza los comandos explícitos de arriba.

### macOS / Linux — Terminal

Dentro de la carpeta del proyecto:

```sh
npm ci
npm run build
npm start
```

Abre [http://127.0.0.1:3100](http://127.0.0.1:3100) y deja el proceso abierto. Detén el servidor con **Ctrl+C**. No ejecutes estos comandos con `sudo` dentro de una carpeta de tu usuario.

### Volver a abrirlo otro día

Entra de nuevo en la carpeta y ejecuta `npm start` (`npm.cmd start` en PowerShell), o usa `INICIAR.cmd` en Windows. No necesitas reinstalar o compilar en cada arranque. Tras actualizar código o dependencias, sigue el apartado de [actualizaciones](DEPLOYMENT.md#actualizaciones-de-la-beta).

## 5. Comprobar la instalación

1. Abre el editor y comprueba que aparecen el catálogo y la escena 3D.
2. Pulsa **Nuevo**, añade una pieza compatible, recarga la página y comprueba que la construcción se conserva.
3. Abre [http://127.0.0.1:3100/healthz](http://127.0.0.1:3100/healthz). Debe responder con `ok: true`, `storage: "sqlite"`, la versión beta y los transportes MCP.

La primera ejecución crea `data/brickforge.sqlite` automáticamente. No necesitas crear tablas, importar datos, instalar un servidor SQLite ni preparar `.env` para el modo local por defecto.

Para una comprobación técnica adicional, desde otra terminal en el proyecto:

```sh
npm run typecheck
npm run catalog:check
npm run test:catalog
npm test
```

Primero debe haberse completado `npm run build`. En PowerShell sustituye `npm` por `npm.cmd` si hace falta. Los tests usan bases temporales y el puerto 3197; no sustituyen una copia de seguridad de tus construcciones.

## 6. Conectar una IA

Con la instalación compilada, sigue la [guía MCP](MCP.md):

- **stdio:** el cliente de IA ejecuta `dist-server/stdio.mjs` con Node. Configura rutas absolutas. No necesita que el servidor web esté abierto.
- **Streamable HTTP:** arranca la web y configura `http://127.0.0.1:3100/mcp`. Abrir esa URL en el navegador devuelve `405`; es normal porque MCP usa peticiones `POST`.

Un cliente que corre en otro equipo no puede llegar a tu `127.0.0.1`: esa dirección se refiere a su propio equipo. Para acceso remoto consulta [Despliegue](DEPLOYMENT.md) y configura HTTPS y autenticación. No abras el modo local sin clave a la red.

## Alternativa: instalar con Docker

Este método requiere **Docker en ejecución y Compose v2**; Node y npm estarán dentro de la imagen. Consulta la [instalación oficial de Docker Compose](https://docs.docker.com/compose/install/): Docker Desktop lo incluye; en Linux también se puede utilizar Docker Engine con el plugin Compose. Comprueba:

```sh
docker --version
docker compose version
```

Descarga o clona el proyecto como antes. En su carpeta, crea un archivo `.env` con una **clave aleatoria propia de al menos 32 caracteres** y este origen:

```dotenv
BRICKFORGE_TOKEN=<sustituye esto por una clave aleatoria real>
PUBLIC_ORIGIN=http://localhost:3100
```

El texto entre `< >` es un marcador: sustitúyelo; no lo uses como clave. Puedes generar una clave con un gestor de contraseñas. Si ya tienes Node, también sirve el comando de generación de la [guía de despliegue](DEPLOYMENT.md#node-en-un-servidor-propio). Guarda `.env` fuera de los commits; ya está excluido por `.gitignore`.

Después:

```sh
docker compose up --build -d
docker compose logs --tail=100 brickforge
```

Abre [http://localhost:3100](http://localhost:3100) e introduce la clave configurada. Para detenerlo conservando los datos:

```sh
docker compose down
```

Los modelos se guardan en un volumen persistente. **No añadas `-v` al detenerlo** si quieres conservar ese volumen. Esta configuración Docker todavía no está verificada en ejecución en la beta; consulta [Despliegue y copias](DEPLOYMENT.md) antes de usarla con datos importantes.

## Problemas habituales

| Problema | Qué comprobar |
| --- | --- |
| `node`, `npm` o `git` no se reconoce | Instala el requisito y abre una terminal nueva. Comprueba el PATH; Git es opcional usando un ZIP. |
| PowerShell bloquea `npm.ps1` | Ejecuta `npm.cmd` en lugar de `npm`; no hace falta cambiar la política de ejecución del equipo. |
| `ENOENT` buscando `package.json` | La terminal debe estar en la carpeta que contiene ese archivo, no en su carpeta superior. |
| Error de versión o `node:sqlite` no disponible | Actualiza Node a 22.22 o posterior, preferiblemente 24 LTS. |
| Falta `dist-server/http.mjs` | Ejecuta `npm ci` y después `npm run build`; si la compilación falla, resuelve ese error antes de arrancar. |
| `EADDRINUSE` o puerto 3100 ocupado | Cierra la otra instancia o configura un puerto libre, por ejemplo `PORT=3102`, en `.env`; reinicia y abre el nuevo puerto. El escritorio utiliza 3101. Para Docker, consulta su configuración de puertos en Despliegue. |
| Escena vacía o error WebGL | Comprueba WebGL 2, la aceleración gráfica y los controladores del navegador/equipo. |
| `ExperimentalWarning` de SQLite en Node 22 | No es por sí solo un fallo. Comprueba que después aparece `Brickforge ready` y responde `/healthz`. |
| `401` al conectar una IA | Si hay `BRICKFORGE_TOKEN`, el cliente HTTP debe enviar Bearer con esa clave. stdio no usa esta autenticación. |
| `403` al abrir un dominio propio | Revisa `PUBLIC_ORIGIN`, Host/Origin y el proxy según la guía de despliegue. |

Si el problema persiste, consulta [cómo informar de una incidencia](../CONTRIBUTING.md). Comparte el error y las versiones, sin tokens, `.env` ni bases de datos.

Regenerar todos los perfiles o ejecutar la batería completa del catálogo puede tardar decenas de minutos, porque revisa las geometrías de origen. Es un paso de desarrollo; no hace falta para abrir los ejecutables ni para instalar una copia del código que ya incluya el catálogo generado.
