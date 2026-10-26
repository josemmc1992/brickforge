# Diseñar LEGO con IA mediante MCP

**BETA · 0.3.0-beta.12.** Brickforge expone las mismas operaciones de construcción que utiliza el editor mediante Model Context Protocol (MCP). No integra un proveedor de IA: el cliente que conectes es quien interpreta tus instrucciones y elige las herramientas.

## Conectar la aplicación de escritorio

En Windows, abre Brickforge y selecciona **Ayuda > Conectar IA**. Copia la configuración que ofrece el menú en tu cliente MCP. La aplicación genera una clave privada para tu instalación y la configuración incluye:

```text
Transporte: Streamable HTTP
URL: http://127.0.0.1:3101/mcp
Authorization: Bearer <clave generada por Brickforge>
```

El texto entre `< >` es un marcador: utiliza la configuración copiada desde tu aplicación. Adapta su estructura al formato de tu cliente y comprueba que admite cabeceras de autenticación. La clave se guarda en `config.json` dentro del perfil de Brickforge y permite leer y modificar todos sus modelos. No la compartas en incidencias, capturas ni commits.

**Mantén Brickforge abierto** mientras la IA utiliza estas herramientas. Al cerrar la aplicación, el servidor MCP se detiene y libera el puerto. No necesitas instalar Node ni ejecutar `npm start` para esta conexión.

El escritorio escucha únicamente en tu equipo. Un cliente remoto no puede acceder a tu `127.0.0.1`; esa dirección siempre se refiere al equipo del cliente. Para alojar un servidor accesible remotamente, utiliza la versión web con HTTPS y autenticación según [Despliegue](DEPLOYMENT.md).

La aplicación de escritorio y la web usan bases de datos distintas por defecto. El MCP del escritorio trabaja sobre los modelos del perfil de Windows; el MCP web de los ejemplos siguientes utiliza los del proyecto. No se sincronizan automáticamente. Consulta [cómo transferir modelos](DESKTOP.md#pasar-tus-modelos-de-la-web-al-escritorio).

## Elegir transporte

| Transporte | Uso | Requisitos |
| --- | --- | --- |
| Streamable HTTP del escritorio | Cliente de IA local; endpoint `127.0.0.1:3101/mcp` | Aplicación abierta y Bearer generado por ella; Node incluido |
| stdio | Cliente de IA instalado en el mismo equipo | Node.js y acceso al directorio de Brickforge |
| Streamable HTTP | Cliente local o remoto con conexión al servidor | Servidor web en ejecución; Bearer si se configura una clave |

Ambos ofrecen las mismas 16 herramientas. La compatibilidad depende de que el cliente admita el transporte y la autenticación elegidos. No se necesita un plugin de ChatGPT. Esta beta no implementa OAuth ni HTTP+SSE antiguo.

## Configurar stdio desde el código

Ejecuta antes `npm ci` y `npm run build`. Para un cliente que use `mcpServers`:

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

En Windows se admiten rutas con `/`, por ejemplo `C:/proyectos/brickforge/dist-server/stdio.mjs`. Si Node no está en el PATH del cliente, usa la ruta absoluta al ejecutable en `command`.

El cliente inicia y controla el proceso. `stdout` se reserva al protocolo; los diagnósticos usan `stderr`. No necesitas arrancar el servidor web. Para visualizar lo que construye la IA, arranca `npm start` apuntando al mismo SQLite. La web consulta cambios del modelo abierto cada 2,5 segundos cuando no está ocupada.

El comando directo del ejemplo no carga `.env`: pasa la configuración en `env`. Si no indicas `BRICKFORGE_DB`, se usa `data/brickforge.sqlite` relativo a la instalación, aunque el cliente tenga otro directorio de trabajo. Una ruta explícita absoluta evita abrir por error otro espacio de trabajo.

**Permisos:** stdio accede a los modelos con los permisos de tu usuario del sistema. No usa la clave HTTP y no ofrece separación por usuario.

## Configurar Streamable HTTP de la versión web

Arranca el servidor web y configura el endpoint en tu cliente:

```text
http://127.0.0.1:3100/mcp
```

Con autenticación activada:

```text
Authorization: Bearer <valor de BRICKFORGE_TOKEN>
```

Guarda la clave en el gestor de credenciales del cliente; no la incorpores a un repositorio. Para acceso remoto utiliza HTTPS y configura `PUBLIC_ORIGIN` como se describe en [Despliegue](DEPLOYMENT.md).

El servidor emplea Streamable HTTP sin sesiones MCP persistentes y con respuestas JSON. El endpoint acepta `POST`; abrir `/mcp` directamente en el navegador devuelve `405` y no es una prueba de fallo. La persistencia reside en SQLite, no en la conexión MCP.

## Herramientas

Las definiciones de entrada se obtienen con `tools/list`. Usa esos esquemas como referencia; los campos pueden evolucionar durante la beta.

| Herramienta | Función |
| --- | --- |
| `catalog_info` | Cuenta, categorías, unidades, capacidades y límites |
| `search_parts` | Buscar por texto/categoría; `connectableOnly=true` limita a piezas construibles |
| `get_part` | Descripción, autor, geometría y perfil de conexión |
| `list_colors` | Colores admitidos y sus códigos LDraw |
| `list_models` | Modelos del espacio de trabajo |
| `create_model` | Crear un modelo vacío o la plantilla `robot` |
| `get_model` | Modelo completo y revisión vigente |
| `capture_model` | PNG del modelo guardado, con vista elegida y revisión exacta |
| `get_connections` | Conectores de una pieza, posición, normal y ocupación |
| `find_connections` | Conexiones compatibles para añadir una referencia a una pieza existente |
| `connect_piece` | Añadir una pieza usando una conexión calculada |
| `place_on_ground` | Crear una base o un subconjunto apoyado en el suelo |
| `edit_model` | Lote atómico de altas, modificaciones y eliminaciones |
| `replace_model` | Sustituir/importar piezas con validación de ensamblaje |
| `analyze_model` | Inventario de piezas e informe de ensamblaje |
| `export_model` | Texto LDraw con pasos de montaje |

## Ver la construcción desde la IA

Desde la beta.10, `capture_model` devuelve un bloque MCP **`image` con PNG en base64**, acompañado por metadatos en texto y `structuredContent`. El cliente debe aceptar imágenes en resultados de herramientas y entregarlas a un modelo con visión. No se necesita un plugin de ChatGPT. Un cliente que solo procese texto podrá seguir construyendo, pero no interpretará estas imágenes.

```json
{
  "modelId": "<id del modelo>",
  "expectedRevision": 12,
  "view": "isometric",
  "width": 1024,
  "height": 768
}
```

- `view`: `isometric` (por defecto), `front`, `back`, `left`, `right` o `top`.
- `width` y `height`: enteros entre 256 y 1024; por defecto 1024 × 768.
- `expectedRevision`: opcional; rechaza la solicitud si esa revisión ya no es la actual.
- La respuesta identifica `modelId`, `revision`, `pieceCount`, `view`, `width` y `height`. Corresponde a la instantánea leída al solicitar la captura, aunque el modelo se edite mientras se procesa.

**Mantén abierto un editor conectado a la misma base de datos.** En el escritorio basta con que Brickforge siga abierto, incluso minimizado. Con stdio, abre también la web apuntando al mismo `BRICKFORGE_DB` y accede a ella si exige autenticación. Un servidor sin interfaz gráfica conectada conserva las herramientas de construcción, pero no puede generar estas capturas.

La imagen se renderiza por separado con las geometrías locales. Puede mostrar otro proyecto sin cambiar tu selección, cámara o paso de montaje. Incluye todas las piezas guardadas del modelo solicitado, no previsualizaciones sin guardar, paneles de la aplicación ni el escritorio del ordenador. No necesita permisos de captura de pantalla ni envía imágenes por iniciativa propia: la IA debe pedirlas.

Las solicitudes caducan a los 30 segundos y se admiten hasta cuatro pendientes por espacio de trabajo. Cada PNG está limitado a 1 MiB. Un modelo vacío, una geometría que no se pueda cargar o la ausencia del renderer producen un error; no se entrega una imagen parcial ni se reutiliza una anterior. Si una imagen resulta demasiado grande, pide menor resolución.

Los trabajos y resultados pasan por una cola SQLite temporal separada de los modelos y se eliminan al consumirse o caducar. No se incluyen en las copias JSON de los modelos; pueden dejar bytes en archivos SQLite/WAL o copias del sistema. La clave MCP permite solicitar estas imágenes igual que permite consultar el modelo. Si utilizas una IA remota, su cliente puede enviar al proveedor la imagen recibida.

Flujo útil: construir un grupo de piezas → pedir una vista isométrica y otra frontal o superior → revisar proporciones y aspecto → modificar → volver a capturar. La inspección visual complementa `analyze_model`; el motor sigue siendo quien valida los encajes y solapamientos.

## Consultar cobertura y límites de encaje

`catalog_info.connectionCoverage` distingue **128 perfiles manuales**, **1.756 variantes decoradas verificadas** y **5.012 perfiles generados**: **6.896 referencias construibles** de las 20.315 del catálogo. Los perfiles generados combinan metadatos LDCad con envolventes y comprobaciones sobre la geometría LDraw de origen. Admiten uniones estándar tetón/hueco exteriores o con acceso certificado en concavidades y familias limitadas de barras R4, ejes A6, pines 3673, cuellos y cinturas de minifiguras con receptores verificados; no implican que todos los conectores o las cavidades de una pieza se puedan utilizar.

`catalog_info.catalogCoverage` informa por separado de metadatos disponibles, metadatos completamente interpretados, envolventes compiladas, motivos de exclusión y familias. **Un registro de datos no equivale a un encaje válido.** Para elegir piezas construibles, utiliza `search_parts` con `connectableOnly=true` y revisa `get_part.connectivity`:

- `supported: true` indica que tiene un perfil admitido; `profile`, `family`, `basePart` y `connectors` describen su procedencia y conexiones disponibles.
- Los perfiles generados estándar tienen `profile: "ldraw-shadow-envelope-v1"` y exponen `fitLimits`. Su envolvente convexa es conservadora; puede rechazar un encaje real que dependa de una concavidad.
- Los perfiles axiales tienen `profile: "ldraw-axial-envelope-v1"`, conectores `bar` o `bar-socket` y sus propios `fitLimits`. Conservan el material alrededor de un canal derivado de las caras de origen.
- `supported: false` devuelve `reasonCode` y `reason`. La IA debe explicar esa limitación o buscar una alternativa, no forzar una colocación por coordenadas.

Los límites de los perfiles generados estándar están en `catalog_info.generatedFitLimits` y en su `get_part.connectivity.fitLimits`:

| Campo | Valor e interpretación |
| --- | --- |
| `nominalConnection` | Metadatos de conexión estándar tetón/hueco LDCad R6/S6 |
| `socketSupportRadialToleranceLdu` | **0,25 LDU**: banda radial usada para verificar presencia continua de material próximo al receptor |
| `socketSupportAxialIntervalLdu` | **[0,5; 3,5] LDU**: intervalo de profundidad donde se comprueba ese material |
| `collisionPenetrationToleranceLdu` | **0,01 LDU**: tolerancia de colisión independiente de la banda radial anterior |
| `physicalContactCertified` | **false**: no se certifica contacto físico exacto, fuerza de sujeción ni tolerancias de fabricación |

La banda radial responde a la simplificación de las superficies LDraw. No es una tolerancia de montaje físico ni autoriza que las piezas se atraviesen 0,25 LDU. La IA debe transmitir esta limitación cuando proponga una construcción que dependa de un ajuste preciso.

Para la familia axial, `catalog_info.generatedAxialFitLimits` describe los contratos R4, las reservas de intervalos y el muestreo de posiciones. `sliding: true`, `capabilities.axialSliding: true` y `capabilities.axialIntervalReservations: true` indican que el motor admite esa mecánica; cada pareja sigue su propio contrato y permiso de deslizamiento. No hay giro continuo. La sección real del receptor se compara con la barra y los cuerpos completos pasan por el detector de colisiones, cuyo umbral sigue siendo 0,01 LDU. `physicalContactCertified: false` se mantiene.

`catalog_info.catalogCoverage.axialGeneratedPartCount` cuenta las referencias R4: **17 en esta beta**, incluidas dentro de los 5.012 perfiles generados. No deben sumarse de nuevo al total construible.

La IA utiliza las mismas herramientas `find_connections` y `connect_piece` para los encajes R4. Puede reutilizar una opción calculada o elegir un desplazamiento axial explícito que cumpla las reglas descritas abajo. El canal interior de un pin no habilita su superficie exterior. Los ejes Technic A6 tienen su propio contrato; los clips y las bisagras siguen pendientes.

Entre los motivos de indisponibilidad están:

| `reasonCode` | Significado |
| --- | --- |
| `missing_connection_metadata` | La referencia no tiene metadatos de conexión incorporados |
| `partial_connection_metadata` | Hay opciones o transformaciones de conexión pendientes de validar |
| `no_verified_standard_connections` | No se ha verificado una unión estándar compatible, aunque exista geometría |
| `missing_collision_envelope` | No hay una envolvente de colisión verificada |
| `shortcut_assembly_not_supported` | Es un conjunto ya montado que requiere descomposición en piezas |
| `sticker_not_rigid_part` | Es una pegatina; todavía falta una herramienta para aplicarla |
| `flexible_geometry_not_supported` | Requiere deformación y encajes específicos |
| `unsupported_meta` | La geometría contiene instrucciones que el compilador no interpreta |
| `face_limit`, `profile_complexity_limit`, `too_many_inactive_features` | Supera un límite de complejidad de esta versión |
| `missing_profile` | No se dispone de un perfil de encaje |

Utiliza siempre el `reason` devuelto como explicación del caso concreto; los códigos pueden ampliarse durante la beta. El catálogo funciona sin conexión externa y los perfiles se cargan bajo demanda con comprobación de integridad. Un error de carga o de memoria impide la operación; no convierte la pieza en libre de colisiones.

## Flujo recomendado para construir

1. Lee `catalog_info` y `list_colors`; busca referencias con `connectableOnly=true` y consulta `get_part` para conocer los conectores y límites del perfil.
2. Crea un modelo con `create_model`, o recupera uno con `get_model`.
3. Añade la primera pieza con `place_on_ground`. El motor decide una posición libre.
4. Consulta `get_connections` para inspeccionar la pieza de apoyo, y `find_connections` para obtener opciones de la nueva pieza.
5. Elige una opción y pasa su objeto `connection` a `connect_piece`. No inventes coordenadas ni identificadores de conectores.
6. Guarda la nueva revisión devuelta por cada escritura. Usa `capture_model` para inspeccionar el resultado y decidir los siguientes cambios. Al terminar, usa `analyze_model` y `export_model`.

Ejemplo de argumentos para crear una base, una vez que tienes el ID y la revisión del modelo:

```json
{
  "modelId": "<id del modelo>",
  "expectedRevision": 1,
  "piece": {
    "id": "base",
    "part": "3003",
    "color": 4,
    "step": 1,
    "group": "Base"
  }
}
```

Después consulta `find_connections` con `modelId`, `anchorId: "base"` y `part: "3004"`. La respuesta incluye `revision`, `options` y `nextOffset`. Cada opción contiene `connection`, `position` y `rotation`; `connect_piece` solo necesita `connection` y los metadatos de la pieza nueva, junto con la revisión actual.

La búsqueda está paginada y acota el trabajo por petición. Si `nextOffset` no es `null`, consulta la siguiente página incluso si `options` está vacío. La respuesta indica `examined` y `maxExamined`: hasta 128 candidatos por petición, o uno cuando el modelo supera las 5.000 piezas para evitar acumular validaciones costosas en una sola llamada. `limit` es un máximo de opciones, no una cantidad garantizada. La opción es una propuesta calculada para una revisión; el servidor vuelve a comprobarla al guardar.

### Acceso estándar en concavidades

`capabilities.sourceCertifiedStandardAccess: true` anuncia perfiles con origen `ldraw-standard-access-envelope-v1`. `catalogCoverage.accessGeneratedPartCount` cuenta **385 referencias**, incluidas en el total generado; `generatedAccessFitLimits` describe la columna libre de 20 × 20 LDU y sus límites. Utiliza `find_connections` y `connect_piece` sin argumentos especiales. El servidor mantiene los obstáculos restantes y rechaza las colocaciones que los atraviesan. No presupongas acceso a todos los conectores de la pieza.

### Ejes cruciformes A6

`capabilities.keyedAxleThroughA6: true` indica soporte del contrato `a6-through-keyed-sliding-v1`. Los perfiles tienen origen `ldraw-keyed-axial-envelope-v1`, conectores `axle` o `axle-socket`, dos polígonos en `axial.sectionComponents` y, para el eje, `axial.engagementInterval`. `axial.length` es la longitud nominal del eje; su tramo útil es 5 LDU más corto. El receptor entero debe caber en él. Se admiten giros de 90° y desplazamiento si al menos uno permite `slide`.

`catalogCoverage.keyedAxialGeneratedPartCount` cuenta **199 referencias**, incluidas en el total generado. `generatedKeyedAxialFitLimits` describe sus límites. Usa las mismas herramientas de búsqueda y colocación; el servidor rechaza mezclas R4/A6, solapamientos y encajes que dependan de los biseles. Los campos históricos `barPieceId` y `barConnectorId` de las reservas también identifican el eje A6.

### Desplazamientos y ocupación axial

`connection.axialOffset` es opcional, vale `0` si se omite y debe ser un número finito en LDU. Se aplica sobre la **normal global del conector de anclaje**, tanto si el anclaje es una barra como si es un receptor:

```text
punto del nuevo conector = punto del anclaje + normal del anclaje × axialOffset
```

Por ejemplo, con una normal `[0, -1, 0]`, un desplazamiento positivo de `8` mueve el nuevo conector 8 LDU hacia abajo. Es un desplazamiento entre conectores, no una posición absoluta de la pieza. Mantén los identificadores de conectores y la orientación de una pareja compatible; el motor calcula la posición de la pieza.

Un desplazamiento no nulo requiere que ambos conectores tengan el contrato `r4-through-sliding-v2` y que al menos uno declare `slide: true`. Todo el receptor debe quedar dentro de la barra y los ejes deben coincidir. Los conectores v1 o las parejas mixtas mantienen centros coincidentes y exclusividad. Una pareja v2 con ambos valores `slide: false` también es centrada y exclusiva. Las conexiones estándar solo admiten desplazamiento `0`.

`get_connections` devuelve `reservations` y `shareable`. Cada reserva axial identifica barra, receptor, conectores, un `interval` medido sobre el eje firmado de la barra y si es `exclusive`. Un receptor solo admite una barra. Una barra compartible puede tener varios receptores en tramos sin solapamiento; una reserva exclusiva impide añadir otro. `occupied: false` en una barra compartible no garantiza que quede sitio para una pieza concreta: consulta las reservas y solicita una colocación, que también debe superar las colisiones del cuerpo completo.

La búsqueda incluye posiciones cada **4 LDU** y límites de tramos libres, con las 24 orientaciones ortogonales admitidas. La respuesta `sampling` informa de esta aproximación. **Agotar las páginas no demuestra que no exista otro desplazamiento válido.** Puedes proporcionar un `axialOffset` continuo distinto; no hace falta inventar coordenadas de piezas. El servidor rechaza valores incorrectos, tramos ocupados, receptores que sobresalen y cualquier ensamblaje inválido sin guardar cambios.

### Cambios simultáneos y fallos

Toda escritura sobre un modelo existente exige `expectedRevision`. Si otra IA o el editor lo ha modificado, vuelve a leerlo y decide de nuevo el cambio. No aumentes la revisión a ciegas ni repitas una colocación sin comprobar si ya existe su ID.

Una operación inválida no modifica el modelo ni incrementa la revisión. Los lotes se aplican por completo o se rechazan. Las respuestas MCP de error usan `isError: true` y un mensaje de texto.

| Error | Qué revisar |
| --- | --- |
| `El modelo ha cambiado` / `Edición simultánea` | Recupera la revisión con `get_model` y recalcula |
| Pieza sin perfil | Busca otra referencia con `connectableOnly=true` |
| Conector ocupado o piezas atravesadas | Solicita nuevas opciones; no fuerces coordenadas |
| Pieza desconectada del suelo | Conserva su apoyo o usa `place_on_ground` para otro subconjunto |
| HTTP `401` | Token Bearer ausente o incorrecto |
| HTTP `403` | Host/Origin no permitido; comprueba endpoint, proxy y `PUBLIC_ORIGIN` |

## Límites del modelo

Máximo de 15.000 piezas, 500 operaciones por lote y 300.000 puntos de conexión. El JSON normalizado de las piezas admite hasta 16 MiB; las peticiones HTTP de modelos y la importación JSON del editor, hasta 20 MiB, medidos en UTF-8. Los límites se comparten entre escritorio, web y MCP y aparecen en `catalog_info.limits`. La complejidad de la geometría y el equipo condicionan la fluidez y el tiempo de las capturas. Los perfiles actuales admiten tetón/hueco, algunas conexiones laterales, barras R4, ejes A6, pines 3673, cuellos y cinturas con receptores verificados. Cada contrato limita los giros que permite. No simulan resistencia, estabilidad ni movimiento de articulaciones. Siguen pendientes las bisagras, los pines distintos del 3673, los ejes con muescas o topes no verificados y los clips. No garantizan la disponibilidad comercial de los colores.

La geometría LDraw incluida se usa para visualizar y como fuente para los perfiles generados. Los encajes no se deducen automáticamente de todas las mallas: cada referencia admitida pertenece a una de las tres capas descritas arriba. Las escrituras de coordenadas directas y `replace_model` pasan por el mismo validador. Los modelos antiguos se pueden leer/exportar y retocar de forma cosmética; un cambio estructural requiere que el conjunto resultante sea válido. Consulta [cobertura del catálogo](CATALOG.md).

La IA tiene acceso a los modelos que le exponga este servidor. Utiliza un cliente de confianza y revisa su política de envío de datos al proveedor.

### Pines Technic de asiento fijo

`capabilities.technicPin20Fixed: true` anuncia `pin`/`pin-hole` con contrato `technic-pin-20-fixed-v1`. Consulta los puertos habilitados, pide opciones con `find_connections` y pasa una opción a `connect_piece`; no añadas `axialOffset`. Cada extremo del 3673 admite un agujero. `occupied` indica cuándo está utilizado; el otro extremo puede recibir una segunda pieza. El canal R4 interior conserva su contrato y su ID.

`catalogCoverage.technicPinGeneratedPartCount` cuenta 369 referencias con esta capacidad; `technicPinNewPartCount`, 297 incorporaciones, y `technicPinEnhancedPartCount`, 72 perfiles ampliados. La capacidad puede solaparse con una familia anterior: no sumes todos estos campos al total. `generatedTechnicPinFitLimits` describe el asiento fijo, los dos extremos independientes y los límites geométricos.

### Cuellos de minifiguras

`capabilities.minifigNeck12Fixed: true` anuncia `neck`/`neck-socket`. Consulta los puertos, pide opciones con `find_connections` y usa `connect_piece` sin `axialOffset`. Una cabeza ocupa el cuello y conserva su tetón superior cuando estaba habilitado. `generatedMinifigNeckFitLimits` describe el asiento fijo y sus límites; la cintura utiliza el contrato independiente descrito a continuación y los brazos siguen pendientes.

`catalogCoverage.minifigNeckGeneratedPartCount` cuenta 1.172 referencias con esta capacidad; `minifigNeckNewPartCount`, 757 incorporaciones; `minifigNeckEnhancedPartCount`, 415 perfiles ampliados. No sumes cifras de capacidades solapadas al total.

### Cinturas de minifiguras

`capabilities.minifigHipstud11Fixed: true` anuncia pares `hip-stud`/`hip-socket`. Cada puerto declara `heading`, una dirección de bisel que debe coincidir con la de su pareja. El servidor calcula la posición; utiliza `find_connections` y pasa la opción a `connect_piece` sin `axialOffset`. El asiento de cintura ocupa ambos puertos, y los conectores de pies y cuello ya habilitados siguen disponibles. `generatedMinifigHipFitLimits` describe el alcance. No habilita articulaciones de piernas ni brazos.

`catalogCoverage.minifigHipGeneratedPartCount` cuenta 871 referencias con esta capacidad; `minifigHipNewPartCount`, 96 incorporaciones; `minifigHipEnhancedPartCount`, 775 perfiles ampliados. No sumes estas capacidades solapadas al total construible.
