# Diseñar LEGO con IA mediante MCP

**BETA · 0.1.0-beta.1.** Brickforge expone las mismas operaciones de construcción que utiliza el editor mediante Model Context Protocol (MCP). No integra un proveedor de IA: el cliente que conectes es quien interpreta tus instrucciones y elige las herramientas.

## Elegir transporte

| Transporte | Uso | Requisitos |
| --- | --- | --- |
| stdio | Cliente de IA instalado en el mismo equipo | Node.js y acceso al directorio de Brickforge |
| Streamable HTTP | Cliente local o remoto con conexión al servidor | Servidor web en ejecución; Bearer si se configura una clave |

Ambos ofrecen las mismas 15 herramientas. La compatibilidad depende de que el cliente admita el transporte y la autenticación elegidos. No se necesita un plugin de ChatGPT. Esta beta no implementa OAuth ni HTTP+SSE antiguo.

## Configurar stdio

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

## Configurar Streamable HTTP

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
| `get_connections` | Conectores de una pieza, posición, normal y ocupación |
| `find_connections` | Conexiones compatibles para añadir una referencia a una pieza existente |
| `connect_piece` | Añadir una pieza usando una conexión calculada |
| `place_on_ground` | Crear una base o un subconjunto apoyado en el suelo |
| `edit_model` | Lote atómico de altas, modificaciones y eliminaciones |
| `replace_model` | Sustituir/importar piezas con validación de ensamblaje |
| `analyze_model` | Inventario de piezas e informe de ensamblaje |
| `export_model` | Texto LDraw con pasos de montaje |

## Flujo recomendado para construir

1. Lee `catalog_info` y `list_colors`; busca referencias con `connectableOnly=true`.
2. Crea un modelo con `create_model`, o recupera uno con `get_model`.
3. Añade la primera pieza con `place_on_ground`. El motor decide una posición libre.
4. Consulta `get_connections` para inspeccionar la pieza de apoyo, y `find_connections` para obtener opciones de la nueva pieza.
5. Elige una opción y pasa su objeto `connection` a `connect_piece`. No inventes coordenadas ni identificadores de conectores.
6. Guarda la nueva revisión devuelta por cada escritura. Al terminar, usa `analyze_model` y `export_model`.

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

La búsqueda está paginada y acota el trabajo por petición. Si `nextOffset` no es `null`, consulta la siguiente página incluso si `options` está vacío. La opción es una propuesta calculada para una revisión; el servidor vuelve a comprobarla al guardar.

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

Máximo de 2.000 piezas, 500 operaciones por lote y 40.000 puntos de conexión. Los perfiles actuales admiten tetón/hueco, algunas conexiones laterales y giros de 90°. No simulan resistencia, estabilidad, bisagras, pines, ejes ni clips. No garantizan la disponibilidad comercial de los colores.

La geometría completa LDraw se usa para visualizar. La validación utiliza perfiles explícitos para 87 referencias; no deduce encajes automáticamente de todas las mallas. Las escrituras de coordenadas directas y `replace_model` pasan por el mismo validador. Los modelos antiguos se pueden leer/exportar y retocar de forma cosmética; un cambio estructural requiere que el conjunto resultante sea válido.

La IA tiene acceso a los modelos que le exponga este servidor. Utiliza un cliente de confianza y revisa su política de envío de datos al proveedor.
