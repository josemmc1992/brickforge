# Brickforge — diseña LEGO con IA

**BETA · 0.3.0-beta.12**

Esta beta mejora el rendimiento del visor al mover y girar construcciones grandes. Mantiene hasta **15.000 piezas por modelo**, la captura de imágenes para la IA, las tolerancias geométricas, el rechazo de solapamientos y las 6.896 referencias construibles.

Brickforge es un editor 3D para **diseñar y construir modelos de LEGO con inteligencia artificial**. Conecta tu asistente mediante MCP, describe lo que quieres construir y observa cómo elige piezas, consulta encajes y modifica el modelo en el editor.

La IA decide la construcción; Brickforge calcula las posiciones de las conexiones y rechaza ensamblajes incompatibles antes de guardarlos. Puedes trabajar manualmente y con una IA sobre los mismos modelos.

**Aplicación de escritorio para Windows x64:** abre Brickforge desde su icono, con el editor y el servidor MCP integrados. El instalador y el ejecutable portable incluyen su entorno de ejecución; no necesitas instalar Node.js, npm ni Git para utilizarlos. Consulta [instalación de escritorio, datos y conexión de IA](docs/DESKTOP.md).

> **Versión beta:** las herramientas, los formatos y las reglas de ensamblaje pueden cambiar. El catálogo incluye **20.315 referencias LDraw**, con **6.896 referencias construibles**: **128 perfiles manuales**, **1.756 variantes decoradas verificadas** y **5.012 perfiles generados** a partir de datos de conexión LDCad y geometría LDraw. Las variantes comparten la mecánica de su base. Los perfiles generados admiten uniones tetón/hueco exteriores o con acceso libre verificado y familias limitadas de barras R4 y ejes Technic cruciformes A6 con receptores pasantes, además del pin sin fricción 3673, agujeros Technic verificados y encajes de cuello y cintura de minifiguras. Otros encajes se rechazan de forma conservadora. El motor no certifica contacto físico exacto, resistencia ni estabilidad. Consulta la [cobertura del catálogo](docs/CATALOG.md).

## Qué incluye

- Editor 3D con catálogo local, colores, pasos de montaje y exportación LDraw (`.ldr`).
- **16 herramientas MCP** mediante **stdio** y **Streamable HTTP**, para clientes compatibles de distintos proveedores.
- **Visión para la IA:** `capture_model` devuelve una imagen PNG del modelo desde seis vistas, con su revisión, para inspeccionar la construcción mientras trabaja.
- Encajes calculados por la aplicación: tetón/hueco, algunas conexiones laterales, barras R4, ejes Technic A6, pines 3673 con agujeros verificados y cuellos y cinturas de minifiguras, con detección de colisiones y giros permitidos por cada contrato.
- Catálogo mecánico en tres capas: perfiles manuales, variantes equivalentes probadas y perfiles derivados de metadatos LDCad y envolventes geométricas.
- Almacenamiento SQLite y copias de seguridad JSON en tu propio equipo.
- Aplicación Windows con icono, accesos directos y conexión de IA desde el menú **Ayuda > Conectar IA**.
- Ejecución con Node.js y configuración Docker para alojarlo donde elijas.

No necesita una cuenta de ChatGPT, un plugin específico ni servicios cloud para funcionar. **No incorpora un modelo de IA:** conectas el cliente y el proveedor que prefieras. Si usas una IA remota, ese cliente puede enviar al proveedor los datos que consulte mediante MCP. Las geometrías se incluyen en el repositorio; la instalación inicial de dependencias necesita acceso a npm.

## Requisitos

**Para la aplicación de escritorio:** Windows de 64 bits, gráficos compatibles con WebGL 2, permiso de escritura en tu perfil y puerto local 3101 libre. El catálogo y el entorno Electron se incluyen en la aplicación. Para diseñar con IA, conecta un cliente compatible con MCP y autenticación Bearer. No se ha establecido un mínimo medido de RAM o GPU; consulta la [guía de escritorio](docs/DESKTOP.md).

**Para ejecutar la versión web desde el código o desarrollar:**

| Requisito | Para qué se necesita |
| --- | --- |
| **Node.js 22.22 o posterior** | Servidor y compilación. Recomendado: [Node.js 24 LTS](https://nodejs.org/en/download), con npm incluido. |
| **npm** | Instalar las dependencias fijadas en `package-lock.json`. |
| **Git**, o el ZIP del proyecto | Descargar el código; Git no es necesario para ejecutar una copia descomprimida. |
| **Navegador con WebGL 2** | Mostrar el editor 3D; WebGL 1 no es suficiente. |
| **Internet durante la instalación** | Descargar el código y las dependencias. El catálogo se incluye localmente. |
| **Carpeta con permiso de escritura y puerto 3100 libre** | Guardar SQLite y ejecutar el servidor local. |
| **Cliente de IA compatible con MCP**, opcional | Diseñar con IA. No hace falta para utilizar el editor manualmente. |

**SQLite ya viene integrado en Node.js:** no instales un servidor de bases de datos. Docker solo es necesario si eliges la instalación en contenedor. No necesitas una cuenta de ChatGPT ni una GPU dedicada para ejecutar un modelo de IA dentro de Brickforge: la aplicación no incluye un modelo de IA.

La versión web con Node se ha probado en Windows. Se incluyen pasos para macOS/Linux y Docker; el contenedor todavía no está verificado en ejecución. La aplicación de escritorio se distribuye para Windows x64; consulta el alcance de sus comprobaciones en la [guía de escritorio](docs/DESKTOP.md). No se distribuyen aplicaciones de escritorio para macOS o Linux. La fluidez del visor depende del equipo y de la complejidad de la construcción.

## Cómo instalar

**Escritorio Windows:** utiliza `Brickforge-Setup-0.3.0-beta.12.exe` para instalar por usuario, o `Brickforge-Portable-0.3.0-beta.12.exe` para ejecutar sin instalador. Ambos guardan los modelos en tu perfil de Windows, incluso la edición portable. Son paquetes beta sin firma digital; Windows puede mostrar un aviso de editor desconocido. Comprueba su procedencia y sigue la [guía de escritorio](docs/DESKTOP.md).

**Web o desarrollo:** la [guía de instalación paso a paso](docs/INSTALLATION.md) explica cómo instalar los requisitos, usar Git o un ZIP, arrancar con Node en **Windows** o **macOS/Linux**, o utilizar **Docker**, comprobar el resultado y resolver los errores habituales.

Si ya tienes los requisitos instalados:

```sh
git clone https://github.com/josemmc1992/brickforge.git
cd brickforge
npm ci
npm run build
npm start
```

Abre [http://127.0.0.1:3100](http://127.0.0.1:3100) y deja la terminal abierta mientras lo usas. Detén el servidor con **Ctrl+C**. La primera ejecución crea una base vacía en `data/brickforge.sqlite`; no necesitas importar modelos ni configurar credenciales para usarlo en tu propio equipo. En Windows también puedes ejecutar `INICIAR.cmd`; si PowerShell bloquea `npm.ps1`, utiliza `npm.cmd` en los comandos anteriores.

Por defecto solo escucha en `127.0.0.1`. Para publicar una instancia con autenticación, consulta [Despliegue y copias de seguridad](docs/DEPLOYMENT.md).

## Conecta tu IA

### Desde la aplicación de escritorio

Abre **Ayuda > Conectar IA** y copia la configuración para tu cliente. El endpoint es `http://127.0.0.1:3101/mcp` y siempre utiliza una clave Bearer generada en tu instalación. Mantén Brickforge abierto mientras la IA construye. La configuración contiene una credencial privada: no la publiques ni la incluyas en capturas. Los ejemplos siguientes corresponden a la versión web; [consulta las diferencias entre instalaciones](docs/MCP.md#conectar-la-aplicación-de-escritorio).

### MCP local con stdio

Compila el proyecto y añade un servidor al cliente MCP. Este ejemplo utiliza el formato `mcpServers`; adapta la estructura a tu cliente y sustituye las rutas por rutas absolutas:

```json
{
  "mcpServers": {
    "brickforge": {
      "command": "node",
      "args": ["/ruta/brickforge/dist-server/stdio.mjs"],
      "env": {
        "BRICKFORGE_DB": "/ruta/brickforge/data/brickforge.sqlite"
      }
    }
  }
}
```

En Windows puedes usar rutas como `C:/proyectos/brickforge/dist-server/stdio.mjs`. El proceso stdio funciona sin arrancar la web. Para ver la construcción, ejecuta también `npm start` con la misma base de datos; el modelo abierto se actualiza automáticamente.

### MCP mediante HTTP

Con el servidor web arrancado, conecta un cliente que admita **Streamable HTTP** a:

```text
http://127.0.0.1:3100/mcp
```

Si configuras `BRICKFORGE_TOKEN`, el cliente debe enviar `Authorization: Bearer <tu clave>`. No todos los clientes admiten el mismo transporte o autenticación: esta beta no incluye OAuth ni el transporte HTTP+SSE antiguo. Consulta la [guía MCP](docs/MCP.md) para ver las herramientas, el flujo de construcción y los errores habituales.

### Una primera construcción

Una vez conectado, puedes pedir a tu IA:

> Crea en Brickforge una torre con una ventana de arco. Lee primero las capacidades del catálogo, usa piezas con perfil de encaje y deja que el motor calcule cada conexión. Organiza la construcción por pasos y analiza el resultado al terminar.

La secuencia recomendada es `catalog_info` → `search_parts` con `connectableOnly=true` → `create_model` → `place_on_ground` → `find_connections` → `connect_piece` → `analyze_model`. El servidor vuelve a validar cada cambio, tanto si llega desde la IA como desde el editor.

## Alcance de la beta

| Capacidad | Estado |
| --- | --- |
| Catálogo y visualización | 20.315 referencias LDraw incluidas |
| Nuevas colocaciones con encaje | 6.896 referencias: 128 perfiles manuales, 1.756 variantes verificadas y 5.012 perfiles generados |
| Conexiones | Tetón/hueco, algunas conexiones laterales, barras R4, ejes A6, pines 3673, cuellos y cinturas con receptores verificados |
| Orientaciones | 24 orientaciones ortogonales mediante giros de 90° |
| Límites por modelo | 15.000 piezas y 300.000 puntos de conexión |
| Edición por lote | Hasta 500 operaciones |
| Tamaño de los modelos | JSON normalizado hasta 16 MiB; importación y peticiones HTTP hasta 20 MiB |
| Simulación física | No incluye resistencia, fricción ni estabilidad |
| Encajes axiales R4 | Desplazamiento validado y varios receptores en tramos libres de una barra cuando los metadatos lo permiten |
| Articulaciones pendientes | Sin giro continuo, bisagras, ejes con muescas o canales tapados, otros pines ni clips |
| Usuarios | Un espacio compartido por instalación; sin cuentas ni permisos por usuario |

Las colisiones utilizan perfiles geométricos y envolventes conservadoras, calculadas desde la geometría real de origen en los perfiles generados. Pueden rechazarse encajes reales ajustados o que requieran aprovechar concavidades. Tener una malla, metadatos o una envolvente registrada no convierte por sí solo una pieza en construible. `get_part.connectivity` informa del soporte o de la razón por la que falta.

Los perfiles generados incluyen **17 referencias axiales R4**, **199 referencias axiales A6**, **3.261 referencias estándar exteriores**, **385 referencias con acceso estándar en concavidades certificado sobre las caras de origen**, **297 referencias mediante agujeros Technic**, **757 referencias mediante encajes de cuello** y **96 referencias nuevas mediante cinturas**. El catálogo completo todavía no es construible: quedan **13.419 referencias sin perfil habilitado**. La [tabla de cobertura](docs/CATALOG.md#cobertura-por-categoría) desglosa las familias y sus motivos de exclusión.

La beta.8 añade 96 referencias con encaje de cintura y amplía 775 perfiles existentes. Mantiene las conexiones anteriores de pies y cuello; el motor comprueba la orientación de los dos postes y rechaza desplazamientos, solapamientos y puertos ocupados.

En los receptores estándar generados, la comprobación del hueco busca material continuo dentro de una banda radial de **0,25 unidades LDraw** alrededor de la conexión nominal R6/S6. Es un límite de la representación geométrica, no una certificación de contacto o fuerza de sujeción. Los receptores axiales R4 usan la sección real del canal, derivada de las caras de origen y conservando el material del cuerpo. La tolerancia de colisión es independiente (**0,01 unidades LDraw**). Las piezas sin perfil pueden consultarse y visualizarse en modelos existentes, pero no añadirse a nuevas colocaciones estructurales. Los colores disponibles no garantizan que exista o se venda esa combinación de pieza y color.

Los modelos antiguos siguen siendo legibles y exportables. Las ediciones estructurales deben dejar el conjunto en un estado válido. Guarda copias antes de actualizar la beta.

## Documentación y desarrollo

- [Aplicación de escritorio para Windows](docs/DESKTOP.md)
- [Requisitos e instalación paso a paso](docs/INSTALLATION.md)
- [Conectar una IA y usar las herramientas MCP](docs/MCP.md)
- [Configuración, despliegue Node/Docker y copias de seguridad](docs/DEPLOYMENT.md)
- [Arquitectura y motor de ensamblaje](docs/ARCHITECTURE.md)
- [Cobertura del catálogo y generación de perfiles](docs/CATALOG.md)
- [Guía de contribución](CONTRIBUTING.md)
- [Seguridad y tratamiento de credenciales](SECURITY.md)
- [Créditos y licencias de terceros](THIRD_PARTY_NOTICES.md)

```sh
npm run typecheck
npm run catalog:check
npm run test:catalog
npm run build
npm test
```

Las pruebas usan bases temporales y clientes MCP por ambos transportes. Cubren encajes, persistencia, edición simultánea, autenticación, origen HTTP, exportación y restauración. La configuración Docker está incluida; **el contenedor todavía no se ha verificado en ejecución**.

Los datos de catálogo se distribuyen ya generados y funcionan sin consultar servicios externos. Para modificar sus fuentes, utiliza `npm run catalog:generate`, revisa los cambios y vuelve a ejecutar las comprobaciones del catálogo. `npm run build` verifica que los registros y sus archivos corresponden a las fuentes.

## Licencias y marcas

Las geometrías y sus atribuciones se conservan bajo las licencias originales de LDraw; consulta [los avisos de terceros](THIRD_PARTY_NOTICES.md). Todavía no se ha declarado una licencia de distribución para el código propio de Brickforge; no debe interpretarse su publicación como una licencia de código abierto.

LEGO es una marca del Grupo LEGO. Brickforge es un proyecto independiente, no afiliado, patrocinado ni aprobado por el Grupo LEGO.

