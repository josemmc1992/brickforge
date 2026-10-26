# Catálogo y cobertura de encajes

**BETA · 0.3.0-beta.12.** Esta versión permite diseñar construcciones de LEGO con IA y admite **6.896 referencias para construir**, pero todavía no cubre todos los encajes del catálogo. Incluye 20.315 referencias LDraw con geometría. Una referencia puede ser una pieza, una decoración, una pegatina, una revisión de molde o un conjunto ya montado; esa cifra no representa 20.315 formas mecánicas diferentes ni el inventario completo de LEGO. Tampoco garantiza que cada combinación de pieza y color se venda físicamente.

La aplicación local, la aplicación de escritorio y el servidor MCP genérico utilizan el mismo motor de ensamblaje. Cualquier cliente de IA compatible con el transporte MCP configurado puede consultarlo y construir; el catálogo y la validación no dependen de ChatGPT.

## Qué significa que una pieza tenga encaje

El filtro **Solo piezas con encaje** muestra las referencias admitidas para construir. `catalog_info.connectionCoverage` separa los perfiles revisados, las variantes equivalentes y los perfiles generados. `catalog_info.catalogCoverage` desglosa el catálogo por categoría y explica los motivos de exclusión. `get_part` identifica el origen del perfil, sus conectores y, cuando corresponde, la referencia base; una pieza no admitida devuelve un motivo, no conexiones supuestas.

| Capa del catálogo | Referencias | Qué acredita |
| --- | ---: | --- |
| Geometría disponible | 20.315 | Consulta y visualización |
| Perfiles base revisados | 128 | Sólidos y conectores modelados expresamente |
| Variantes con equivalencia geométrica verificada | 1.756 | Reutilización del perfil de una base revisada |
| Perfiles generados a partir de geometría y metadatos | 5.012 | Uniones estándar, R4, A6, pines fijos, cuellos o cinturas que superan las comprobaciones descritas abajo |
| Total admitido para construir | **6.896** | Referencias con alguno de los tres tipos de perfil |

El total construible es la suma de las tres clases de perfiles, sin contar una referencia dos veces. Los perfiles base no son necesariamente moldes únicos y las decoraciones no añaden capacidades mecánicas nuevas. Las referencias sin perfil siguen disponibles para consulta y visualización de modelos existentes; incorporarlas mediante una edición estructural se rechaza.

Las 5.012 referencias generadas utilizan 4.150 archivos de perfil distintos: varios identificadores pueden compartir datos iguales. Este número de archivos tampoco representa un conteo de moldes únicos.

Las familias principales agrupan **3.261 referencias estándar exteriores**, **385 con acceso estándar en concavidades**, **17 axiales R4**, **199 axiales A6**, **297 referencias Technic**, **757 referencias de cuello** y **96 referencias de cintura**. La beta.6 añadió **297 referencias construibles** mediante agujeros Technic y amplió **72 referencias ya admitidas**, conservando sus IDs de conexión anteriores. En total, **369 referencias** ofrecen el contrato de pin fijo. Esta cifra se solapa con las familias anteriores y no se suma de nuevo al total.

### Cobertura por categoría

Resumen de `lib/generated-assembly.json.summary.byCategory`. «Construibles» suma perfiles revisados, variantes y perfiles generados; una referencia construible puede ofrecer solo parte de sus conexiones físicas.

| Categoría LDraw | En el catálogo | Construibles | Pendientes |
| --- | ---: | ---: | ---: |
| Brick | 1.240 | 878 | 362 |
| Plate | 462 | 381 | 81 |
| Tile | 1.653 | 1.413 | 240 |
| Slope | 502 | 395 | 107 |
| Arch | 53 | 43 | 10 |
| Bracket | 45 | 44 | 1 |
| Baseplate | 193 | 137 | 56 |
| Wedge | 99 | 95 | 4 |
| Minifig | 2.993 | 1.323 | 1.670 |
| Technic | 1.112 | 417 | 695 |
| Hinge | 153 | 100 | 53 |
| Sticker | 2.767 | 0 | 2.767 |
| Resto de categorías | 9.043 | 1.670 | 7.373 |
| **Total** | **20.315** | **6.896** | **13.419** |

Las referencias de Technic pueden ofrecer uniones estándar, canales R4, conexiones A6 o agujeros Technic verificados. Las piezas de Hinge admitidas ofrecen uniones estándar; no movimientos de bisagra. La pertenencia a una categoría no habilita los demás mecanismos de sus piezas.

### Datos intermedios

Las siguientes cifras describen etapas intermedias de la compilación y **no se suman al total construible**:

| Resultado intermedio | Referencias |
| --- | ---: |
| Con algún metadato de conexión heredado de LDCad | 15.622 |
| Con metadatos efectivos interpretados completamente | 14.333 |
| Con interpretación parcial | 1.292 |
| Sin metadatos efectivos | 4.690 |
| Con envolvente de colisión compilada | 12.446 |

La clasificación completa/parcial/ausente cubre las 20.315 referencias. Tener algún metadato es otra medida: una referencia puede contener instrucciones y diagnósticos sin conservar conectores efectivos. Interpretar todos sus metadatos no demuestra que el motor implemente su tipo de unión; tener una envolvente tampoco demuestra que exista un encaje válido.

## Perfiles revisados y variantes

Los 128 perfiles de `lib/base-profiles.ts` conservan su prioridad sobre los perfiles generados. Sus cuerpos pueden componerse de varios sólidos convexos para conservar recortes, como los de esquinas y arcos. Incluyen ladrillos altos, pendientes, placas en L, placas con tetón centrado y tetones laterales, además de las formas básicas.

Cada perfil respeta el origen de su DAT y sus puntos de unión reales. Por ejemplo, 3939 solo expone los tetones de sus extremos; 14719 es una esquina lisa; 2639 omite un hueco junto a una nervadura interior hasta modelar sus tolerancias. Un tetón hueco no habilita automáticamente una unión de barra o eje.

`lib/assembly-variants.json` incorpora 1.756 variantes equivalentes de 46 bases, incluidas 285 más que en 0.2.0-beta.2. El nombre de una pieza solo selecciona candidatas; nunca prueba la equivalencia. El compilador utiliza tres vías:

1. **Decoración planar:** conserva exactamente el núcleo estructural de una base revisada. Cada polígono o arista adicional debe quedar dentro de una cara exterior permitida, con tolerancia de 0,01 LDU.
2. **Decoración sobre superficies facetadas:** conserva un núcleo expresamente revisado y contrasta la decoración con las facetas exteriores reales del DAT. Esto amplía las pruebas a superficies de discos y cilindros; no convierte cualquier superficie curva en intercambiable.
3. **Equivalencia exacta:** compara la geometría transitiva y sus transformaciones con una base revisada. Si dos bases geométricamente equivalentes tienen perfiles mecánicos distintos, no elige una por el nombre.

El registro actual contiene 1.514 pruebas planares y 242 sobre superficies facetadas. La tercera vía está implementada, pero no añade referencias en este catálogo. Se rechazan núcleos modificados o repetidos, geometrías que sobresalen, archivos ausentes, ciclos, exceso de complejidad e instrucciones no interpretadas. Las huellas SHA256 vinculan la prueba a la geometría transitiva y al perfil físico revisado.

## Compilación local de metadatos y colisiones

La ampliación utiliza una copia fijada de [LDCad Shadow Library](https://github.com/RolandMelkert/LDCadShadowLibrary/tree/9b1131fb1991f8c0bfc072325e4e12f6271aba35), revisión `9b1131fb1991f8c0bfc072325e4e12f6271aba35`. Los 4.285 DAT de esa copia, sus cabeceras de autoría y su procedencia se conservan en `vendor/ldcad-shadow/`. Una vez instaladas las dependencias, los compiladores trabajan con estos archivos y la geometría incluida, sin descargar datos durante la compilación ni durante una construcción.

El proceso tiene tres etapas independientes:

1. **Resolver los metadatos.** `compile-shadow-catalog.mjs` expande la herencia, las transformaciones y las directivas de anulación compatibles, convierte las coordenadas y registra las características no interpretadas. Escribe `lib/shadow-catalog.json`, el informe `vendor/ldcad-shadow/coverage.json` y los paquetes `public/catalog/shadow/`. Un estado `complete` solo describe la interpretación de los metadatos.
2. **Compilar las envolventes.** `compile-collision-catalog.mjs` resuelve la geometría LDraw y produce una envolvente exterior conservadora del cuerpo. Solo separa tres primitivas de tetón estándar revisadas y fijadas mediante huellas de contenido. Escribe `lib/collision-manifest.json` y `public/catalog/collision/`. Pegatinas, piezas flexibles, conjuntos `Shortcut` y geometrías fuera de los límites de interpretación no obtienen envolventes habilitantes.
3. **Habilitar perfiles utilizables.** `compile-generated-assembly.mjs` exige metadatos completos y una envolvente válida. Primero busca tetones y receptores estándar, exteriores y alineados con los ejes. Cada tetón debe corresponder a geometría separada verificada. Cada receptor debe superar tanto la comprobación del espacio de inserción como la de paredes de soporte en la geometría original. Los tetones separados que no tengan una conexión habilitada vuelven a incorporarse como obstáculos. Si no se obtiene un perfil estándar, se intentan los contratos axiales R4, A6 y finalmente el acceso estándar certificado descritos más abajo. Después se intentan los pines y agujeros Technic verificados: pueden ampliar un perfil existente conservando sus conectores. Después se prueban cuellos y receptores de minifigura: pueden añadir perfiles o ampliar cabezas existentes sin borrar sus tetones. Después se prueban los postes de cintura y sus receptores; se conservan los puertos de pies y cuello anteriores. El resultado se guarda en `lib/generated-assembly.json` y `public/catalog/assembly/`.

Cuando un perfil estándar supera el límite de 128 obstáculos independientes, el compilador comprueba si algunos están completamente contenidos en el cuerpo que utiliza el motor. Solo omite un obstáculo si todos sus vértices quedan dentro de los límites estrictos del cuerpo en cada eje de sus caras. No amplía límites, no utiliza una tolerancia adicional y no elimina el material cubierto: este sigue formando parte del cuerpo. Los perfiles ya admitidos conservan su representación anterior.

Un receptor estándar R6/S6 necesita estas comprobaciones conjuntas:

- **Entrada en la superficie admitida:** el plano de entrada coincide con el plano exterior de apoyo de la envolvente y el punto queda dentro de ella. Se rechazan puntos de metadatos flotantes o desplazados fuera del cuerpo.
- **Inserción accesible:** el volumen de inserción de radio 6 LDU y profundidad 4 LDU, junto con el corredor desde el exterior de la pieza, debe estar libre de superficies obstructivas. La comprobación utiliza un polígono de 16 lados que circunscribe el cilindro; una cavidad cerrada no cuenta como una entrada accesible.
- **Paredes presentes y continuas:** se buscan superficies laterales alrededor del receptor durante todo el intervalo axial de 0,5 a 3,5 LDU. La prueba calcula intervalos continuos a partir de cortes de los triángulos, y comprueba que las normales de las paredes rodeen el eje. Dos paredes paralelas o paredes presentes a distintas alturas no bastan.

Para los receptores nominales `R6` y `S6`, la búsqueda de paredes admite una **banda radial de 0,25 LDU**, entre 6 y 6,25 LDU. Esta banda verifica presencia geométrica de paredes próximas; **no demuestra contacto físico exacto, fuerza de agarre ni tolerancias de fabricación**. El espacio vacío por sí solo no demuestra un encaje. Tampoco lo demuestra este cálculo de superficies por sí solo: se exige además el metadato nominal compatible y las demás comprobaciones. El resultado es un perfil geométrico conservador de esta beta, no una certificación de la pieza real.

No se habilita una pieza por tener un nombre conocido, un cilindro parecido o una cantidad determinada de metadatos. Un perfil generado puede exponer solo parte de las uniones físicas de la pieza. Las exclusiones y sus motivos se conservan en los manifiestos para poder revisarlos.

## Encajes axiales R4

Esta ampliación añade un contrato limitado para **una barra recta de radio nominal 4 LDU y un receptor pasante compatible**, representados por `bar` y `bar-socket`. Los perfiles R4 originales utilizan el formato de datos versión 2 y el origen `ldraw-axial-envelope-v1`. Una ampliación Technic puede usar versión 5 y conservar los mismos conectores y contratos R4. Se generan como alternativa cuando una referencia no tiene ya un perfil estándar admitido; los perfiles revisados y los encajes existentes conservan su prioridad.

La generación admite **17 referencias axiales**. Además de probar que el canal está vacío, exige que pueda alojar la sección de una barra R4 admitida utilizando el comparador del motor. Por ejemplo, 61794 sigue excluida: su canal derivado no supera esa comprobación. No se agranda el vacío para aumentar la cobertura.

La prueba de la barra exige en la geometría expandida las 16 caras laterales cuadriláteras y los 32 triángulos que forman sus dos tapas. Todo el cuerpo debe quedar dentro del prisma R4 completo. Ni el nombre, ni el metadato, ni una línea central libre sustituyen esa prueba.

Para el receptor, `scripts/lib/axial-envelope.mjs` deriva un canal recto de las caras de la geometría original. Exige extremos abiertos coincidentes con los límites del cuerpo, paredes de soporte continuas y ausencia de superficies dentro del canal. Solo entonces resta el canal de la envolvente convexa, conservando el material en varios sólidos de colisión. Otros huecos permanecen rellenos de forma conservadora; un obstáculo o una tapa dentro del canal impide habilitarlo.

El encaje compara la **sección real del vacío**, un polígono convexo en orden antihorario de hasta 64 vértices. Si supera ese límite se rechaza: no se recorta la lista de vértices para hacerla caber. Las coordenadas redondeadas de LDraw pueden hacer que el polígono nominal R4 invada ligeramente alguna cara; por eso el canal se reduce según las caras originales, sin agrandarlo ni eliminar material. En las primeras referencias verificadas, esa reducción respecto al nominal llega aproximadamente a **0,001236 LDU**. Es una medida de esos casos, no una tolerancia universal autorizada.

Las reglas de colocación distinguen dos contratos:

- `r4-through-sliding-v2` exige ejes coincidentes con precisión numérica de `1e-8` LDU y que toda la longitud del receptor quede dentro de la barra. Si ambos conectores son v2 y al menos uno declara `slide: true`, el motor admite desplazamiento sobre el eje. Esta combinación OR sigue la [especificación de metadatos LDCad](https://www.melkert.net/LDCad/tech/meta).
- Cada receptor reserva un intervalo en el eje firmado de la barra y admite una sola barra. Una barra puede alojar varios receptores si sus intervalos no se solapan. Los intervalos pueden tocarse por sus extremos, pero los cuerpos completos también deben pasar la comprobación de colisión.
- Una pareja v2 sin permiso de deslizamiento exige centros coincidentes y reserva la barra de forma exclusiva. El contrato `r4-through-centered-fixed-v1`, incluso combinado con v2, conserva igualmente el centrado y la exclusividad; no hereda el permiso de deslizamiento del otro conector.
- Solo se admiten las 24 orientaciones ortogonales obtenidas mediante giros de 90°. No hay giro libre, rotación continua ni simulación de articulaciones.
- La sección de la barra debe caber en la sección del receptor y los cuerpos completos deben superar la comprobación de colisión. El ajuste y el detector SAT mantienen el umbral existente de **0,01 LDU**; este umbral no agranda el canal compilado ni representa una tolerancia de fabricación. La reserva axial usa la precisión numérica de `1e-8` LDU, no la tolerancia del detector de colisiones.

`find_connections` propone muestras de desplazamiento cada 4 LDU, además de los límites de los tramos libres. Su paginación puede devolver una página vacía con `nextOffset` pendiente. Agotar las páginas no demuestra que no exista un desplazamiento continuo válido. Para elegir otra posición se puede enviar `connection.axialOffset` a `connect_piece`: se mide en LDU sobre la normal global del conector de anclaje y el servidor valida de nuevo el encaje, las reservas, las colisiones y la conexión al suelo. Consulta el [contrato MCP](MCP.md#desplazamientos-y-ocupación-axial).

Las pruebas con referencias reales incluyen las barras 30374 y 87994 y los receptores interiores de 3673, 2780 y 4274. En estos últimos se admite el canal interior verificado; **el contrato R4 no habilita por sí solo los encajes exteriores**. La referencia 3673 añade estos encajes mediante la prueba independiente de pin descrita abajo; 2780 y 4274 siguen limitados al canal interior. Los ejes cruciformes utilizan el contrato A6 separado; clips y bisagras siguen pendientes. El deslizamiento permite elegir una colocación geométrica, sin simular agarre, fricción, fuerza o resistencia, y no completa el catálogo.

## Ejes Technic A6

Los perfiles versión 3, con origen `ldraw-keyed-axial-envelope-v1`, exponen `axle` y `axle-socket`. La cruz se conserva como unión de dos prismas hexagonales convexos: rellenar sus esquinas cóncavas impediría los encajes reales. La prueba del eje exige una familia de primitivas revisadas y fijadas por SHA-256, las dos tapas biseladas y todas las caras expandidas originales. No utiliza una lista de IDs permitidos.

Para un eje de longitud nominal L, el cuerpo ocupa L−1 LDU y el tramo de sección completa que puede encajar mide **L−5 LDU**. Un receptor debe quedar entero dentro de ese tramo; la punta biselada no cuenta como enganche. El contrato `a6-through-keyed-sliding-v1` admite giros de 90° y desplazamiento axial cuando al menos un conector permite deslizamiento. Cada receptor reserva su intervalo y los cuerpos completos deben pasar SAT. A6 y R4 no son intercambiables.

El receptor se certifica sobre toda la geometría original: ocho superficies rectangulares de soporte deben estar cubiertas continuamente, y ninguna superficie puede invadir los dos corredores que forman la cruz. Estos vacíos solo se contraen frente a las caras originales; se restan de la envolvente sin eliminar material. La prueba del vacío usa 1e-8 LDU, independiente del umbral de ajuste y colisión de 0,01 LDU. Una sección demasiado estrecha se rechaza. También se rechazan tapas, paredes incompletas y obstáculos, incluso más allá del intervalo local si bloquean el corredor infinito conservador.

La familia incorpora **199 referencias**: 13 ejes completos y 186 receptores. Cada perfil generado ha demostrado un encaje en el motor y el rechazo de una copia solapada. Las pruebas detalladas de 13 ejes por siete receptores cubren 91 parejas y 728 orientaciones alineadas; el comparador también comprueba los dos extremos de desplazamiento y el rechazo justo fuera de ellos. MCP HTTP, stdio y las pruebas de escritorio utilizan un eje 3705 con tres casquillos 3713, además de intentos inválidos que deben conservar el modelo y su revisión.

No se habilitan por ello el engrane entre dientes, la rotación continua, los canales tapados, ejes con muescas ni otras articulaciones. Los límites están disponibles en `catalog_info.generatedKeyedAxialFitLimits` y `get_part.connectivity.fitLimits`.

## Acceso estándar en concavidades

Los perfiles versión 4, con origen `ldraw-standard-access-envelope-v1`, permiten utilizar un tetón o receptor estándar situado dentro de la envolvente convexa. El compilador demuestra que una columna de **20 × 20 LDU**, desde el conector hacia el exterior, está libre de caras del cuerpo. Solo resta ese espacio comprobado: el resto de las concavidades sigue siendo conservador. Un obstáculo en cualquier punto del acceso, incluso lejos de la entrada, impide habilitarlo.

La prueba usa todas las caras originales y una tolerancia de vacío de 1e-8 LDU. Un tetón necesita además una primitiva revisada y coincidente; un receptor debe superar las comprobaciones independientes de inserción y paredes de soporte. Se reconstruyen desde su geometría todos los tetones no utilizados como obstáculos. No se elimina material para hacer caber una unión ni se acepta un conector flotante fuera de la envolvente.

La ampliación incorpora **385 referencias**: 357 ofrecen un tetón y 28 un receptor. Cada perfil ofrece una unión certificada, aunque la pieza pueda tener otras. Entre los casos de integración están el esquí 6120 con una baldosa 3070b y la pendiente curva 3573 sobre un ladrillo 3005. Todas las referencias generadas deben demostrar un encaje válido y rechazar una copia solapada en el motor. La prueba geométrica independiente comprueba también caras que atraviesan varios sólidos del recorte.

Se utilizan las mismas herramientas MCP y la misma validación del editor. Los límites se consultan en `catalog_info.generatedAccessFitLimits` y `get_part.connectivity.fitLimits`; la capacidad se anuncia como `sourceCertifiedStandardAccess`. Una pieza vecina mayor que el acceso demostrado puede seguir rechazándose, aunque la unión física fuera posible. Esta capacidad no habilita automáticamente otras cavidades, clips ni bisagras.

## Pines Technic con encaje fijo

Los perfiles versión 5, con origen `ldraw-technic-pin-envelope-v1`, admiten el **pin sin fricción 3673** y agujeros pasantes de 20 LDU con tres tramos: radio 8 durante 2 LDU, radio 6 durante 16 LDU y radio 8 durante 2 LDU. Los conectores son `pin` y `pin-hole`, con contrato `technic-pin-20-fixed-v1`.

Cada extremo del 3673 puede ocupar un agujero distinto. El servidor calcula el asiento fijo y valida los cuerpos completos, incluida la pestaña y las puntas reales del pin; rechaza desplazamientos axiales, conectores ocupados y solapamientos. El canal interior R4 conserva su ID y contrato anteriores. Una referencia ampliada conserva también sus conectores estándar o axiales ya habilitados.

El compilador exige metadatos completos, comprueba las **48 superficies rectangulares** de las paredes facetadas y prueba el vacío frente a todas las caras originales. Los accesos de radio 8 continúan hasta el exterior: una tapa lejana también los bloquea. Solo resta los tres prismas demostrados vacíos. La geometría transitiva completa del pin 3673 está fijada por SHA256; no se extrapola su prueba a pines con fricción o formas parecidas. Las pruebas independientes cubren las caras completas del modelo original con los sólidos finales y ensayan cada puerto nuevo en el motor.

La beta.6 añadió **297 referencias construibles** mediante agujeros Technic y amplió **72 referencias ya admitidas**, conservando sus IDs de conexión anteriores. En total, **369 referencias** ofrecen el contrato de pin fijo. Esta cifra se solapa con las familias anteriores y no se suma de nuevo al total. No todos los agujeros de una pieza se habilitan: cada agujero necesita su propia prueba y el perfil completo debe respetar el máximo de 129 sólidos convexos. Las conexiones se consultan mediante `get_connections` y `find_connections`; no se deben inventar posiciones ni IDs a partir del nombre de la pieza.

La capacidad se anuncia como `technicPin20Fixed`. `generatedTechnicPinFitLimits` describe límites y ocupación. Este contrato no permite giro continuo, movimiento articulado, deformación, fuerza de inserción ni simulación de fricción o agarre.

## Cuellos de minifiguras con asiento fijo

Los perfiles versión 6, con origen `ldraw-minifig-neck-envelope-v1`, añaden `neck` y `neck-socket` con contrato `minifig-neck-12-fixed-v1`. El cuello tiene radio nominal 6 LDU y longitud 12; el receptor verificado dispone de una cavidad de 20 LDU. El servidor hace coincidir la base del cuello con la boca de la cavidad. No permite desplazar la cabeza a lo largo del cuello ni ocupar un cuello dos veces.

La parte del torso situada sobre el plano del cuello debe coincidir exactamente con la geometría superior revisada de 973, incluida su marca. El resto del torso se conserva en una envolvente convexa independiente. Cada triángulo original debe permanecer contenido en uno de los dos sólidos; no se recorta material para forzar el encaje.

Para el receptor se prueban las 16 paredes facetadas completas y el vacío hasta el exterior de la boca y hasta 20 LDU hacia dentro. Una tapa, un obstáculo interior o una pared incompleta impiden habilitarlo. Solo se resta el prisma demostrado vacío. Los tetones superiores ya admitidos conservan sus IDs y sus contratos. El nombre o categoría de la referencia no sustituye estas pruebas: una pieza de otra categoría puede compartir el mismo receptor geométrico.

La beta.7 añadió **757 referencias construibles** y amplió **415 perfiles anteriores** mediante encajes de cuello. **1.172 referencias** ofrecen esta capacidad; se solapa con las familias anteriores y no se suma de nuevo al total.

El motor sigue comprobando los cuerpos completos y conserva su tolerancia de colisión de 0,01 LDU. Las pruebas verifican cada puerto en los cuatro giros de asiento y cubren todas las caras originales con los sólidos finales. El contrato de cuello no habilita brazos, manos, accesorios de cabeza ni articulaciones de piernas. La cintura utiliza el contrato independiente descrito a continuación. No se simulan articulación continua, fricción ni fuerza de agarre.

`catalog_info.capabilities.minifigNeck12Fixed` anuncia la capacidad; `generatedMinifigNeckFitLimits` expone sus límites. Pide los puertos con `get_connections`, utiliza `find_connections` y pasa una opción a `connect_piece` sin `axialOffset`.

## Cinturas de minifiguras con asiento fijo

Los perfiles versión 7, con origen `ldraw-minifig-hips-envelope-v1`, añaden los pares `hip-stud`/`hip-socket` y el contrato `minifig-hipstud-11-fixed-v1`. Los dos postes de 11 LDU se asientan en los receptores del torso. Cada puerto tiene una dirección exterior, `heading`, que representa el bisel del poste: el motor exige que las direcciones coincidan y las normales estén enfrentadas. El montaje completo ocupa los dos puertos. No permite un desplazamiento axial ni un giro lateral de 90°; admite los asientos frontal y trasero cuando los cuerpos completos quedan libres.

La geometría superior de las caderas debe coincidir exactamente con los postes revisados de 3815b. El torso debe conservar la interfaz inferior revisada de 973. Cada una de las dos cavidades exige además una prueba de vacío sobre todas las caras originales, abierta hasta el exterior. Una decoración que sobresalga bajo el plano de asiento puede requerir un prisma exterior adicional: solo se resta si también se demuestra vacío, conservando el dibujo en su pared. No se elimina material para hacer que una pieza encaje.

Los huecos de los pies y los conectores de cuello ya habilitados mantienen sus IDs y contratos. Las pruebas verifican ambos puertos en los dos asientos, las 24 orientaciones globales y la cadena de base, pies, cintura, cuello y tetón de cabeza. Cada cara original debe seguir cubierta por los sólidos finales.

La beta.8 añade **96 referencias construibles** y amplía **775 perfiles anteriores** mediante encajes de cintura. **871 referencias** ofrecen esta capacidad; se solapa con las familias anteriores y no se suma de nuevo al total.

Esto no habilita las articulaciones entre caderas y piernas ni los brazos. Tampoco representa movimiento continuo, resistencia o fricción. `catalog_info.capabilities.minifigHipstud11Fixed` anuncia la capacidad y `generatedMinifigHipFitLimits` documenta sus límites. Consulta los puertos y utiliza `find_connections` y `connect_piece` sin `axialOffset`.

## Validación durante una construcción

La IA elige la pieza y uno de los encajes ofrecidos mediante `get_connections`, `find_connections` y `connect_piece`. El servidor calcula la colocación y comprueba colisiones, ocupación de conectores y conexión con una base apoyada en el suelo. Las escrituras desde la interfaz, MCP HTTP y MCP stdio pasan por esta misma validación antes de actualizar la revisión del modelo en SQLite.

Los perfiles generados se cargan bajo demanda. El servidor verifica su huella, tamaño y estructura; mantiene una caché de hasta 128 MiB y retiene los perfiles utilizados hasta acabar la operación. Un archivo ausente, alterado, inválido o un límite de memoria excedido produce un error antes de guardar. No se omite la comprobación porque el perfil aún no esté en memoria.

Las envolventes generadas rellenan huecos y concavidades salvo los canales axiales, agujeros Technic, cavidades de cuello y cintura y accesos estándar expresamente verificados. Pueden rechazar una colocación físicamente posible dentro de un arco, una cavidad o una pieza curva. Esta aproximación es deliberadamente conservadora: no autoriza atravesar el cuerpo de una pieza para aprovechar un conector. Los perfiles revisados con varios sólidos conservan los huecos que modelan expresamente.

## Regenerar y comprobar

Desde la raíz del código fuente, después de seguir los [requisitos y la instalación](INSTALLATION.md):

```sh
npm run catalog:generate
```

El comando ejecuta los cuatro compiladores en orden: equivalencias, metadatos, envolventes y perfiles utilizables. Revisa los cambios de los manifiestos, los motivos de rechazo y los archivos derivados antes de incorporarlos. La compilación completa de geometría y perfiles es más costosa que una comprobación de integridad.

Para verificar los archivos existentes:

```sh
npm run catalog:check
```

Este comando ejecuta `--check` en los cuatro compiladores y comprueba que se conservan las licencias y los avisos. `npm run build` lo ejecuta también antes de compilar la aplicación. La comprobación de variantes y la de metadatos recalculan sus resultados. En colisiones y perfiles generados, `--check` comprueba las huellas de las entradas y los archivos resultantes; `--verify` realiza la recompilación completa y compara el resultado:

```sh
node scripts/compile-collision-catalog.mjs --verify
node scripts/compile-generated-assembly.mjs --verify
```

Las pruebas específicas cubren equivalencias adversarias, herencia y anulación de conectores, límites de los compiladores, obstrucciones del espacio de inserción y receptores sin paredes de soporte válidas. Entre los casos negativos figuran paredes a ±6,2501 LDU, fuera de la banda radial admitida:

```sh
npm run test:catalog
npm run build
npm test
```

`test:catalog` ejecuta las suites de variantes, metadatos, colisiones y adaptación a perfiles, y compila y ejecuta la prueba de perfiles en el motor. Esta última comprueba archivos ausentes o alterados, operaciones concurrentes y el rechazo de ensamblajes inválidos. Incluye también las pruebas axiales de barra completa, canal con material conservado, secciones, colocación y cinco referencias reales a través de un manifiesto temporal. Ese ensayo temporal no modifica el manifiesto publicado. `npm test` utiliza clientes MCP reales y una base SQLite temporal para comprobar la integración.

Para añadir una capacidad, conserva los IDs de conectores existentes y añade pruebas positivas y negativas del mecanismo. Una nueva fuente de metadatos no basta: debe disponer de interpretación, geometría de colisión, reglas de compatibilidad y validación de la inserción. No pases una malla cóncava al detector SAT como si fuera un sólido convexo.

## Lo que sigue pendiente

Quedan **13.419 referencias sin perfil habilitado**. El manifiesto conserva un motivo principal de exclusión por referencia; una misma referencia puede tener además otras limitaciones pendientes:

| Motivo principal | Referencias |
| --- | ---: |
| Sin una unión estándar, axial, de pin, de cuello ni de cintura verificable por el motor actual | 3.702 |
| Conjunto LDraw `Shortcut` sin descomponer | 4.602 |
| Pegatina sin mecanismo de aplicación | 2.767 |
| Sin metadatos de conexión | 1.639 |
| Geometría con instrucciones no interpretadas | 258 |
| Geometría flexible no admitida | 219 |
| Metadatos de conexión interpretados parcialmente | 211 |
| Límite de complejidad geométrica | 21 |
| **Total** | **13.419** |

Siguen pendientes los pines distintos del 3673, los ejes con muescas o topes no verificados, los clips, las uniones de barra fuera de los contratos R4 descritos, las bisagras y otras articulaciones. Una pieza de esas familias puede admitir algún tetón estándar o canal R4 sin que sus demás conexiones estén implementadas. Las 199 referencias A6 habilitan únicamente la conexión certificada, no todas las conexiones de esas piezas. También quedan la deformación de piezas flexibles, la aplicación de pegatinas y la descomposición de conjuntos `Shortcut`. Estos datos no permiten declarar terminado el soporte de todo el catálogo.

El motor mantiene 24 orientaciones ortogonales. No simula fuerzas, fricción, flexibilidad ni estabilidad estructural. Una construcción aceptada no constituye una garantía de resistencia ni de disponibilidad comercial de las piezas.

La autoría, las licencias de las fuentes y los cambios de representación se detallan en [Créditos y licencias](../THIRD_PARTY_NOTICES.md). Los datos derivados de LDCad se distribuyen con su licencia CC BY-SA 4.0 y sus avisos; esto no es una declaración de licencia para todo el código de Brickforge.
