# Brickforge — diseña LEGO con IA

**BETA · 0.1.0-beta.1**

Brickforge es un editor 3D para **diseñar y construir modelos de LEGO con inteligencia artificial**. Conecta tu asistente mediante MCP, describe lo que quieres construir y observa cómo elige piezas, consulta encajes y modifica el modelo en el editor.

La IA decide la construcción; Brickforge calcula las posiciones de las conexiones y rechaza ensamblajes incompatibles antes de guardarlos. Puedes trabajar manualmente y con una IA sobre los mismos modelos.

> **Versión beta:** las herramientas, los formatos y las reglas de ensamblaje pueden cambiar. El catálogo incluye **20.315 referencias LDraw**, de las cuales **87 tienen perfiles de encaje**. El motor comprueba geometría y conexiones para esas piezas; no certifica resistencia ni estabilidad física.

## Qué incluye

- Editor 3D con catálogo local, colores, pasos de montaje y exportación LDraw (`.ldr`).
- **15 herramientas MCP** mediante **stdio** y **Streamable HTTP**, para clientes compatibles de distintos proveedores.
- Encajes calculados por la aplicación: tetón/hueco, algunas conexiones laterales, rotaciones de 90° y detección de colisiones.
- Almacenamiento SQLite y copias de seguridad JSON en tu propio equipo.
- Ejecución con Node.js y configuración Docker para alojarlo donde elijas.

No necesita una cuenta de ChatGPT, un plugin específico ni servicios cloud para funcionar. **No incorpora un modelo de IA:** conectas el cliente y el proveedor que prefieras. Si usas una IA remota, ese cliente puede enviar al proveedor los datos que consulte mediante MCP. Las geometrías se incluyen en el repositorio; la instalación inicial de dependencias necesita acceso a npm.

## Requisitos

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

La instalación se ha probado en Windows. Se incluyen pasos para macOS/Linux y Docker, pero esas ejecuciones aún no están verificadas en esta beta. No se ha establecido un mínimo medido de RAM o GPU; la fluidez del visor depende del equipo y de la complejidad de la construcción.

## Cómo instalar

La [guía de instalación paso a paso](docs/INSTALLATION.md) explica cómo instalar los requisitos, usar Git o un ZIP, arrancar en **Windows**, **macOS/Linux** o **Docker**, comprobar el resultado y resolver los errores habituales.

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
| Nuevas colocaciones con encaje | 87 referencias con perfiles definidos |
| Conexiones | Tetón/hueco y algunas conexiones laterales |
| Orientaciones | 24 orientaciones ortogonales mediante giros de 90° |
| Límites por modelo | 2.000 piezas y 40.000 puntos de conexión |
| Edición por lote | Hasta 500 operaciones |
| Simulación física | No incluye resistencia, fricción ni estabilidad |
| Articulaciones | Sin encajes de bisagras, ejes, pines o clips |
| Usuarios | Un espacio compartido por instalación; sin cuentas ni permisos por usuario |

Las colisiones utilizan perfiles geométricos y envolventes conservadoras para las superficies curvas. Algunos encajes reales ajustados pueden rechazarse. Las piezas sin perfil pueden consultarse y visualizarse en modelos existentes, pero no añadirse a nuevas colocaciones estructurales. Los colores disponibles en el editor no garantizan que exista o se venda esa combinación de pieza y color.

Los modelos antiguos siguen siendo legibles y exportables. Las ediciones estructurales deben dejar el conjunto en un estado válido. Guarda copias antes de actualizar la beta.

## Documentación y desarrollo

- [Requisitos e instalación paso a paso](docs/INSTALLATION.md)
- [Conectar una IA y usar las herramientas MCP](docs/MCP.md)
- [Configuración, despliegue Node/Docker y copias de seguridad](docs/DEPLOYMENT.md)
- [Arquitectura y motor de ensamblaje](docs/ARCHITECTURE.md)
- [Guía de contribución](CONTRIBUTING.md)
- [Seguridad y tratamiento de credenciales](SECURITY.md)
- [Créditos y licencias de terceros](THIRD_PARTY_NOTICES.md)

```sh
npm run typecheck
npm run build
npm test
```

Las pruebas usan bases temporales y clientes MCP por ambos transportes. Cubren encajes, persistencia, edición simultánea, autenticación, origen HTTP, exportación y restauración. La configuración Docker está incluida; **el contenedor todavía no se ha verificado en ejecución**.

## Licencias y marcas

Las geometrías y sus atribuciones se conservan bajo las licencias originales de LDraw; consulta [los avisos de terceros](THIRD_PARTY_NOTICES.md). Todavía no se ha declarado una licencia de distribución para el código propio de Brickforge; no debe interpretarse su publicación como una licencia de código abierto.

LEGO es una marca del Grupo LEGO. Brickforge es un proyecto independiente, no afiliado, patrocinado ni aprobado por el Grupo LEGO.
