# Contribuir a Brickforge

Brickforge está en **beta (0.3.0-beta.12)**. Su objetivo es permitir **diseñar LEGO con IA**, con un editor visual y un motor que controle los encajes para todos los clientes.

Todavía no se ha declarado una licencia de distribución para el código propio. Antes de proponer una contribución de código para su incorporación, acuerda con el mantenedor sus condiciones de uso y distribución. Las licencias de las dependencias y de LDraw son independientes; consulta [los avisos de terceros](THIRD_PARTY_NOTICES.md).

## Informar de un problema

Utiliza las incidencias del repositorio e incluye versión, sistema operativo, versión de Node, cliente MCP y transporte, pasos para reproducir y comportamiento esperado. Para fallos de encaje, indica las referencias de piezas, conectores y rotación; adjunta un modelo mínimo que no contenga datos privados.

No publiques tokens, cookies, `.env`, bases SQLite ni copias personales. Para vulnerabilidades, sigue [la política de seguridad](SECURITY.md).

## Preparar el entorno

```sh
git clone https://github.com/josemmc1992/brickforge.git
cd brickforge
npm ci
npm run typecheck
npm run catalog:check
npm run test:catalog
npm run build
npm test
npm start
```

Se requiere Node.js 22.22 o posterior. Para comprobar cambios, recompila y reinicia el servicio. Los tests de integración utilizan una base temporal y el puerto 3197 por defecto; puedes cambiarlo con `TEST_PORT` si está ocupado.

## Qué preservar al cambiar código

- El editor, HTTP MCP y stdio deben pasar por `lib/service.ts` y las mismas reglas de ensamblaje.
- No añadas una vía que permita guardar estructuras inválidas omitiendo el motor.
- Conserva el control por revisión: un conflicto no debe sobrescribir cambios de otro cliente.
- No atribuyas soporte físico a una referencia solo porque se pueda visualizar su malla.
- No envíes logs normales a `stdout` en el transporte stdio.
- Mantén configuración sensible en variables de entorno y los datos fuera del repositorio.

## Ampliar el catálogo mecánico

El catálogo tiene tres capas: **128 perfiles manuales**, **1.756 variantes decoradas verificadas** y **5.012 perfiles generados** a partir de metadatos LDCad y geometría LDraw. Cada nueva referencia debe entrar por un criterio comprobable; registrar datos, una malla o una envolvente no basta para declararla construible.

- Para una familia manual, define sólidos y conectores y comprueba encaje válido, colisión, ocupación, rotación y apoyo. Revisa especialmente orígenes asimétricos y superficies con huecos.
- Para una variante, conserva la prueba de equivalencia con su base; no uses una coincidencia de nombre o tamaño.
- Para un perfil generado, conserva la trazabilidad entre metadatos, superficies de origen y envolvente. Los conectores exteriores admitidos y los canales axiales deben pasar sus verificaciones específicas; los casos no admitidos deben mantener una razón explícita de indisponibilidad.

La comprobación nominal R6/S6 de receptores generados busca presencia continua de material en una banda radial de **0,25 LDU**, dentro del intervalo axial de **0,5 a 3,5 LDU**. No demuestra contacto físico exacto, fuerza de sujeción ni tolerancias de fabricación. No confundas esa banda con la tolerancia de colisión **0,01 LDU** ni la amplíes para hacer pasar un ejemplo. Cualquier cambio de estos límites requiere revisar las pruebas de frontera y la información MCP `generatedFitLimits`/`connectivity.fitLimits`.

La familia axial R4 tiene contratos independientes: barras completas probadas contra sus caras originales y canales pasantes derivados de la sección realmente vacía. Conserva todo el material al restar el canal de la envolvente. El polígono de sección debe mantenerse completo, convexo y en orden antihorario, con un máximo de 64 vértices; no trunques vértices para superar el límite. Sus límites aparecen en `generatedAxialFitLimits` y `connectivity.fitLimits`.

`r4-through-sliding-v2` exige ejes coincidentes con precisión numérica de `1e-8` LDU y todo el receptor dentro de la barra. El desplazamiento solo se habilita cuando **ambos** conectores son v2 y al menos uno tiene `slide: true`; esa combinación OR procede de los metadatos LDCad. Cada receptor admite una barra y reserva su intervalo en el eje firmado de ella. Los tramos de distintos receptores no pueden solaparse; una unión fija reserva la barra de forma exclusiva. `r4-through-centered-fixed-v1`, incluso mezclado con v2, conserva los centros coincidentes y la exclusividad. No extiendas estas reglas a giro continuo ni encajes exteriores de pines. Los ejes cruciformes tienen su propio contrato A6, no son barras R4 de otro radio.

`axialOffset` se mide sobre la normal global del conector de anclaje, que puede ser la barra o el receptor. Rechaza valores no finitos, tipos incorrectos y desplazamientos incompatibles. Conserva las 24 orientaciones ortogonales, la validación de cuerpos completos y la ocupación independiente del orden de las piezas. La búsqueda solo muestrea posiciones cada 4 LDU y límites de tramos libres; mantén la paginación y la posibilidad de solicitar explícitamente un desplazamiento continuo válido.

Un canal vacío también debe aceptar la sección de una barra admitida en el comparador del motor; no lo amplíes para hacer pasar el ajuste. En los perfiles estándar que exceden 128 obstáculos independientes, solo se permite omitir un sólido si está completamente contenido en el cuerpo real de colisión, usando sus vértices y ejes sin tolerancia añadida. Conserva los perfiles previamente admitidos y añade pruebas de protrusiones mínimas y de cuerpos rotados o asimétricos.

Las pruebas axiales deben cubrir tapas, obstrucciones interiores, conservación del material, barras incompletas, secciones incompatibles, límites de desplazamiento y ocupación múltiple. Incluye anclajes de ambos tipos, ejes invertidos, intervalos contiguos o solapados, contratos antiguos y mixtos, páginas vacías con continuación y comprobaciones de colisión del cuerpo completo. `test:catalog` incluye los módulos de prueba y una integración con referencias reales mediante un manifiesto temporal; no uses esa integración para modificar el manifiesto distribuido. Los requisitos y las aproximaciones se explican en [Catálogo](docs/CATALOG.md).

Después de cambiar fuentes o compiladores:

```sh
npm run catalog:generate
npm run catalog:check
npm run test:catalog
npm run typecheck
npm run build
npm test
```

Revisa los registros generados, motivos de exclusión y archivos de catálogo antes de incorporarlos. La generación trabaja con fuentes locales; no requiere descargar metadatos durante el uso de la aplicación. No edites los índices o archivos generados para evitar un rechazo del motor. Mantén licencias y atribuciones junto a los datos. Consulta [Arquitectura](docs/ARCHITECTURE.md) y [Catálogo](docs/CATALOG.md).

## Proponer un cambio

Describe el problema, el comportamiento resultante y cómo lo has verificado. Mantén el cambio acotado y actualiza los esquemas MCP o la documentación cuando corresponda. Ejecuta `npm run typecheck`, `npm run catalog:check`, `npm run test:catalog`, `npm run build` y `npm test` antes de solicitar revisión. Para cambios de escritorio, prueba también la aplicación local y el portable generado según [Escritorio](docs/DESKTOP.md). Si cambias Docker, verifica el arranque real y la persistencia del contenedor; compilar TypeScript no comprueba ese mecanismo.

No incluyas `node_modules`, compilados, credenciales, bases, backups ni archivos de tu entorno. Respeta las cabeceras, autores y licencias al añadir o modificar geometría LDraw.

Los perfiles A6 versión 3 requieren la unión de dos secciones convexas, nunca la envolvente convexa de la cruz. El eje completo debe superar la prueba de fuentes revisadas; el receptor prueba ocho superficies de soporte continuas y un corredor vacío. El intervalo útil del eje biselado mide la longitud nominal menos 5 LDU. Prueba el adaptador, el comparador de secciones, las reservas, ambos sentidos de anclaje, los cuerpos completos y los transportes MCP. No sumes una referencia a la cobertura sin demostrar al menos un encaje real en `test-generated-runtime.ts`.

Los perfiles de acceso estándar versión 4 solo restan columnas exteriores cuyo vacío está probado frente a las caras de origen. La prueba del vacío no certifica por sí sola un conector. Conserva la comprobación separada del tetón o receptor y todos los tetones inactivos como obstáculos. Incluye casos de tapas, caras que atraviesan el corredor, conectores flotantes y geometría manipulada; no amplíes la tolerancia de vacío para aceptar piezas.

Los pines tienen un contrato fijo separado (`technic-pin-20-fixed-v1`), no son barras R4 ni ejes A6. Una ampliación v5 debe preservar los IDs y contratos anteriores, certificar cada nuevo hueco frente a toda la geometría de origen y mantener cubiertas todas sus caras. La referencia 3673 requiere su geometría transitiva revisada y fijada. Ejecuta las pruebas de cada puerto, las de caras completas y las de perfiles mixtos malformados; no habilites otros pines por semejanza visual.

Los cuellos usan el contrato independiente `minifig-neck-12-fixed-v1`. Para ampliar esta familia exige equivalencia exacta de la geometría superior revisada o prueba completa de paredes y vacío del receptor, preserva los conectores anteriores y ejecuta las pruebas de cada puerto, caras completas, activos malformados y MCP. No infieras brazos, caderas ni accesorios a partir de un cuello válido.

Las cinturas usan `minifig-hipstud-11-fixed-v1`: dos postes orientados, equivalencia de geometría superior e interfaz inferior y prueba completa de vacío. Conserva los puertos y evidencias heredados. Comprueba cada asiento, las caras originales, la cadena pies–cintura–cuello y los activos v7 malformados. Un dibujo fuera del plano de asiento no autoriza a borrar material ni a aumentar la tolerancia de colisión.
