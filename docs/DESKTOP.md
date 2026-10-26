# Brickforge para escritorio

**BETA · 0.3.0-beta.12 — diseña LEGO con IA.** La aplicación de escritorio reúne el editor 3D, el catálogo LDraw, la base de datos local y el servidor MCP en una ventana de Windows. Se abre desde su propio icono y permite conectar una IA compatible con MCP.

## Requisitos y alcance

Desde la beta.11 puedes guardar hasta **15.000 piezas por construcción**, con un presupuesto de **300.000 puntos de conexión**. El límite de edición sigue siendo de **500 operaciones por lote**. Importar JSON admite archivos de hasta **20 MiB**; el modelo normalizado se guarda con un máximo de **16 MiB**. La fluidez de una escena grande depende de la geometría y de los recursos del equipo; este límite no garantiza una tasa de imágenes concreta.

- **Windows de 64 bits (x64)** y gráficos compatibles con WebGL 2 para mostrar la escena 3D.
- Permiso de escritura en tu perfil de Windows y **puerto local 3101 libre**.
- Espacio para la aplicación, el catálogo y tus modelos. La fluidez depende del equipo y del tamaño de las construcciones; todavía no se ha establecido un mínimo medido de RAM o GPU.
- Un **cliente de IA compatible con MCP Streamable HTTP y cabecera Bearer**, si quieres construir con IA. El editor también funciona manualmente. El cliente y su proveedor pueden tener requisitos y costes propios.

**No necesitas instalar Node.js, npm, Git, Python ni SQLite para ejecutar los paquetes de escritorio.** Electron y el entorno de ejecución vienen incluidos. Una vez descargado el paquete, el catálogo funciona localmente; la conexión a Internet que necesite la IA depende de tu proveedor. Brickforge no incorpora un modelo de IA ni exige una cuenta de ChatGPT.

La beta incluye **20.315 referencias visibles** y **6.896 construibles**: 128 perfiles manuales, 1.756 variantes decoradas verificadas y 5.012 perfiles generados a partir de metadatos LDCad y geometría de origen. Los archivos necesarios se distribuyen con la aplicación y se cargan cuando se utilizan. La presencia de una pieza en el catálogo no garantiza que todos sus encajes estén admitidos; consulta [cobertura y límites](CATALOG.md).

El motor ofrece uniones estándar tetón/hueco y familias limitadas de barras R4 y ejes Technic A6 con receptores pasantes. En A6, el casquillo debe quedar dentro del tramo útil del eje, sin utilizar los biseles como enganche. En los perfiles R4 actuales permite elegir desplazamientos y colocar varios receptores sobre una barra cuando sus metadatos lo admiten. Cada receptor debe quedar entero dentro de ella y ocupar un tramo libre; los cuerpos completos siguen comprobándose contra colisiones. Solo se admiten giros de 90°. Los contratos antiguos conservan el centrado y un único compañero; no se habilita giro continuo. El pin sin fricción 3673 dispone de un contrato independiente con dos extremos de encaje fijo y agujeros Technic verificados. Otros pines siguen pendientes.

Esta beta se distribuye para **Windows x64**. No se ofrecen ni se han probado paquetes de escritorio para macOS o Linux. La [versión web con Node](INSTALLATION.md) sigue disponible por separado.

## Instalar con icono y accesos directos

1. Obtén `Brickforge-Setup-0.3.0-beta.12.exe` del paquete de distribución de Brickforge y comprueba su procedencia.
2. Ejecuta el instalador. La instalación es por usuario y crea accesos directos para abrir Brickforge.
3. Abre **Brickforge** desde el acceso directo. La aplicación inicia su servicio local y muestra el editor sin una terminal abierta.
4. Comprueba que aparecen el catálogo y la escena. Crea un modelo, cierra la aplicación y vuelve a abrirla para comprobar que se conserva.

**El instalador de esta beta no tiene firma digital.** Windows puede mostrar un aviso de editor desconocido o SmartScreen. Comprueba el origen y la integridad del archivo antes de decidir ejecutarlo; no desactives las protecciones de Windows. En equipos administrados, sigue las políticas de tu organización.

No hay actualizaciones automáticas en esta versión. Antes de instalar una versión posterior, exporta una copia desde el menú **Archivo** y cierra Brickforge.

## Ejecutable portable

Abre `Brickforge-Portable-0.3.0-beta.12.exe` si prefieres ejecutar Brickforge sin instalador. Incluye el mismo editor y servidor MCP.

**Portable significa que no requiere instalación, no que lleve tus datos dentro del ejecutable.** Los modelos y la configuración se guardan en el perfil del usuario de Windows, también al abrirlo desde una memoria USB. Copiar el `.exe` a otro equipo no copia tus construcciones: utiliza una copia JSON para transferirlas.

La edición instalada y el portable utilizan el mismo perfil de Brickforge para el mismo usuario. Mantén una sola instancia abierta. El aviso sobre la ausencia de firma digital también se aplica al portable.

## Conectar una IA

1. Abre Brickforge y selecciona **Ayuda > Conectar IA**.
2. Copia la configuración del servidor en tu cliente MCP. El menú incluye el endpoint local y la cabecera `Authorization` con la clave generada para tu instalación.
3. Deja Brickforge abierto y comprueba desde el cliente que puede listar las herramientas.
4. Pide una construcción, por ejemplo: «Crea una torre de LEGO en Brickforge. Consulta las piezas con perfil de encaje, usa conexiones calculadas y analiza el resultado al terminar».

El endpoint del escritorio es `http://127.0.0.1:3101/mcp`. El cliente debe admitir **Streamable HTTP** y autenticación Bearer. No necesita un plugin específico de ChatGPT. Al cerrar Brickforge, el servicio MCP se detiene y el puerto queda libre.

Desde la beta.10, la IA puede pedir `capture_model` para recibir un PNG de la construcción desde seis vistas. Funciona con la aplicación minimizada y no cambia el proyecto ni la cámara del editor. La imagen contiene exclusivamente el modelo guardado; el cliente necesita admitir imágenes MCP y utilizar un modelo con visión. Consulta [parámetros y requisitos de las capturas](MCP.md#ver-la-construcción-desde-la-ia).

La configuración copiada contiene una **credencial privada** que permite consultar y modificar todos los modelos del perfil. Guárdala en la configuración privada de tu cliente; no la pegues en un repositorio ni la publiques en una captura. Si conectas un proveedor remoto, revisa qué datos envía tu cliente a ese proveedor.

Un cliente que se ejecute en otro equipo no puede llegar a tu `127.0.0.1`. Para alojar un servidor remoto, utiliza las instrucciones de [despliegue web](DEPLOYMENT.md). Consulta también las [herramientas y el flujo de construcción MCP](MCP.md).

## Dónde están tus datos

| Contenido | Ruta predeterminada en Windows |
| --- | --- |
| Modelos SQLite | `%APPDATA%\Brickforge\data\brickforge.sqlite` |
| Configuración privada y clave MCP | `%APPDATA%\Brickforge\config.json` |
| Copias JSON exportadas | La ubicación que elijas en el diálogo de guardado |

Puedes pegar `%APPDATA%\Brickforge` en la barra de direcciones del Explorador de archivos. No publiques esta carpeta: contiene tus modelos y credenciales. La instalación comienza vacía; los paquetes no incluyen ni importan automáticamente construcciones personales.

La versión web sigue utilizando por defecto `data/brickforge.sqlite` dentro del proyecto y el puerto **3100**. El escritorio utiliza su propio perfil y el puerto **3101**. Pueden contener modelos distintos; no hay sincronización automática entre ambos.

## Copias de seguridad

Desde **Archivo**, utiliza la opción de exportar copia JSON y elige un nombre nuevo. Guarda una copia antes de actualizar o transferir modelos. Para restaurar, utiliza la opción de importar copia JSON del mismo menú.

El formato `brickforge-backup-v1` conserva identificadores, nombres, revisiones, piezas y fechas. La importación omite los modelos idénticos y **rechaza los conflictos sin sobrescribir los modelos existentes**. Si el mismo identificador ya existe con cambios, conserva ambas copias y resuelve cuál es la versión que quieres restaurar antes de continuar; no borres datos para forzar la importación.

Una exportación LDraw `.ldr` sirve para intercambiar una construcción, pero no sustituye la copia JSON de todos los modelos. No copies únicamente el archivo `.sqlite` mientras Brickforge está abierto: SQLite puede mantener cambios en archivos WAL. Utiliza la exportación JSON o cierra todos los procesos antes de copiar el directorio de datos.

## Pasar tus modelos de la web al escritorio

La migración se hace mediante una copia y mantiene intactos los originales de la versión web:

1. En la carpeta del proyecto web ya compilado, exporta a una ruta nueva fuera del repositorio. Por ejemplo, en PowerShell:

   ```powershell
   npm.cmd run backup -- export "$env:USERPROFILE\Documents\brickforge-web-copia.json"
   ```

   Si el archivo ya existe, elige otro nombre: la herramienta no lo sobrescribe. El comando utiliza la base web configurada mediante `.env` o `BRICKFORGE_DB`; por defecto, `data/brickforge.sqlite` del proyecto. En macOS/Linux puedes usar `npm run backup -- export /ruta/nueva/copia.json`.

2. Abre la aplicación de escritorio. Si ya tienes construcciones allí, exporta primero su propia copia desde **Archivo**.
3. Usa la opción de importar copia JSON de **Archivo** y selecciona el archivo exportado desde la web.
4. Comprueba que aparecen los modelos importados y abre uno para revisar su contenido. Conserva el archivo JSON y la base web original hasta verificar la transferencia.

La importación conserva los IDs. Si detecta un conflicto con un modelo existente, se rechaza la operación; no sobrescribe ni mezcla versiones. Las copias pueden preservar geometrías antiguas y las posteriores ediciones estructurales vuelven a pasar por el validador de encajes.

## Desarrollar y generar los ejecutables

Este apartado sí requiere **Node.js 22.22 o posterior y npm**; se recomienda Node.js 24 LTS. Git es opcional si usas un ZIP del código. Para fabricar los paquetes Windows de esta beta, utiliza Windows x64 y conexión a Internet para descargar las dependencias y herramientas de empaquetado. Electron 44.9.0 está fijado como dependencia de desarrollo y se incluye en los ejecutables generados.

Desde la carpeta del proyecto:

```sh
npm ci
npm run desktop:dev
```

Para generar distribuciones:

```sh
npm run desktop:build
```

Los comandos disponibles son:

| Comando | Uso |
| --- | --- |
| `npm run desktop:dev` | Compilar y abrir la aplicación de escritorio desde el código |
| `npm run desktop:dir` | Generar una aplicación desempaquetada para comprobaciones locales |
| `npm run desktop:build` | Generar instalador NSIS y ejecutable portable para Windows x64 |
| `npm run desktop:test` | Ejecutar las comprobaciones automatizadas del escritorio |
| `npm run desktop:test -- --packaged` | Comprobar el EXE en `release/win-unpacked` después de empaquetar |
| `npm run desktop:test -- --portable` | Comprobar el portable después de generar los paquetes |
| `npm run test:viewer` | Medir el visor con escenas de 1.000, 5.000 y 15.000 piezas en Electron y comprobar selección, pasos y cambios |

En PowerShell puedes sustituir `npm` por `npm.cmd` si se bloquea `npm.ps1`. No omitas las dependencias de desarrollo antes de compilar o empaquetar.

Los recursos del catálogo ya vienen generados. Para cambiar sus fuentes o reglas, utiliza `npm run catalog:generate`, revisa los cambios y ejecuta `npm run catalog:check` y `npm run test:catalog` antes de volver a empaquetar. `npm run build`, y por tanto el empaquetado de escritorio, comprueba la vigencia del catálogo.

Las comprobaciones del escritorio cubren el entorno Node/SQLite incluido, construcción mediante MCP, copias JSON, autenticación, aislamiento de la ventana y persistencia al cerrar. Se pueden ejecutar sobre Electron en desarrollo, el EXE empaquetado y el portable; cada prueba usa un perfil temporal vacío y no modifica los modelos de tu perfil habitual.

`npm run test:viewer` crea un visor de prueba y un perfil independientes. Sus resultados y capturas quedan en `.desktop-tests/`, fuera del paquete y del repositorio. Para comparar con la beta.11 en un clon que contenga ese commit, ejecuta:

```sh
npm run test:viewer -- --baseline-ref=469af24c4d61effb36515fa0cebbbe4d13480ff3 --frames=30
```

El parámetro opcional `--installed-fixture` añade la construcción más grande del perfil de Windows: lee SQLite sin modificarlo y guarda una copia de las piezas en la carpeta de resultados. Esa carpeta contendrá datos de tu construcción; el ensayo predeterminado solo utiliza modelos sintéticos. Las cifras dependen de la geometría, la cámara, el tamaño de ventana y la GPU, por lo que no representan una garantía de fluidez para cualquier modelo.

Generar un instalador NSIS no verifica su instalación y desinstalación. Esa ejecución no se ha comprobado para esta beta. Las pruebas tampoco sustituyen comprobar el comportamiento en tu equipo y la conexión desde tu cliente MCP, ni implican validación de otras plataformas de escritorio.

## Problemas habituales

| Problema | Qué comprobar |
| --- | --- |
| El puerto 3101 está ocupado | Cierra la otra instancia de Brickforge o la aplicación que utilice ese puerto y vuelve a abrirlo. No cambies el puerto web a 3101 si quieres usar ambos a la vez. |
| La IA no conecta | Mantén Brickforge abierto; utiliza la configuración de **Ayuda > Conectar IA**, el puerto 3101 y un cliente compatible con Streamable HTTP y Bearer. |
| HTTP `401` | Vuelve a copiar la configuración desde esta instalación; una clave de otro perfil no sirve. |
| La IA ve otros modelos | Comprueba que utiliza el endpoint del escritorio 3101 y no la web 3100 ni un servidor stdio con otra base. |
| Escena vacía o error WebGL | Revisa los controladores gráficos y la disponibilidad de WebGL 2 en el equipo. |
| La copia JSON no se importa | Debe ser una copia compatible `brickforge-backup-v1`; comprueba el mensaje de error y posibles conflictos de IDs. Un `.ldr` no es una copia JSON. |
| Aviso de editor desconocido | Esta beta no está firmada. Comprueba su procedencia e integridad y respeta las políticas de seguridad de tu equipo. |

Si necesitas informar de una incidencia, incluye la versión, Windows y el mensaje de error. No adjuntes `config.json`, claves, bases SQLite ni copias privadas. Consulta [Contribuir](../CONTRIBUTING.md).

Brickforge es un proyecto independiente. LEGO es una marca del Grupo LEGO; la aplicación y su icono no implican afiliación, patrocinio ni aprobación por el Grupo LEGO.

La beta.8 incorpora la cintura de minifiguras con dos postes orientados y asiento fijo, compartido con los transportes MCP. Conserva los encajes habilitados de pies y cuello. Brazos, articulaciones de piernas y movimiento continuo siguen pendientes. Consulta la cobertura exacta en [CATALOG.md](CATALOG.md).
