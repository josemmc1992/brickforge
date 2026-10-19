# Créditos, licencias y marcas

Este documento identifica materiales de terceros incluidos o utilizados por Brickforge. No sustituye sus textos de licencia ni concede una licencia para el código propio del proyecto.

## LDraw

El catálogo y la geometría proceden de la biblioteca de piezas de **LDraw.org** y de sus autores individuales. Fuente del proyecto: [LDraw.org](https://www.ldraw.org/).

Los archivos LDraw se distribuyen en paquetes JSON comprimidos con gzip dentro de `public/catalog/geometry/*.bin`. El empaquetado cambia el contenedor de distribución; los textos de geometría conservan sus cabeceras de autoría, licencia e historial. El catálogo incluye también la autoría de cada referencia en `public/catalog/parts.json`. Los perfiles de encaje de Brickforge son una representación adicional utilizada por el motor y no sustituyen la geometría ni sus atribuciones.

`lib/assembly-variants.json` es un registro derivado de comprobaciones sobre esas geometrías: conserva la referencia base y una huella de la evidencia. `lib/collision-manifest.json` y `public/catalog/collision/*.bin` contienen envolventes conservadoras obtenidas al resolver las transformaciones de los DAT, separar primitivas de tetón expresamente revisadas y calcular cuerpos convexos. Estas representaciones no sustituyen las formas originales ni su autoría. Las reglas, transformaciones y límites se describen en [Cobertura del catálogo](docs/CATALOG.md).

Consulta los documentos originales incluidos:

- [Acuerdo y guía de atribución](public/catalog/CAreadme.txt)
- [Creative Commons Attribution 2.0](public/catalog/CAlicense.txt)
- [Creative Commons Attribution 4.0 International](public/catalog/CAlicense4.txt)
- [Información de la biblioteca](public/catalog/Readme.txt)

Las condiciones aplicables dependen de la declaración `!LICENSE` de cada archivo y, para archivos con licencia dual, del historial de modificaciones descrito en el acuerdo. No atribuyas una única licencia indiferenciada a toda la biblioteca. Al redistribuir o modificar sus materiales, conserva autores, origen, licencia e indicación de los cambios conforme a las condiciones correspondientes.

## LDCad Shadow Library

Los metadatos de conexión proceden de **LDCad Shadow Library y sus colaboradores**, mantenida por Roland Melkert. Se incluye la revisión [`9b1131fb1991f8c0bfc072325e4e12f6271aba35`](https://github.com/RolandMelkert/LDCadShadowLibrary/tree/9b1131fb1991f8c0bfc072325e4e12f6271aba35) del [repositorio original](https://github.com/RolandMelkert/LDCadShadowLibrary), distribuida bajo [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).

La copia `vendor/ldcad-shadow/sources.json.gz` contiene 4.285 archivos DAT de `p/` y `parts/`, con sus cabeceras originales de autoría e historial. Brickforge ha normalizado los finales de línea a LF y empaquetado los textos en un mapa JSON comprimido con gzip, sin alterar sus metadatos. [La procedencia y las huellas](vendor/ldcad-shadow/provenance.json) fijan la revisión y el contenido de esta copia. Se conserva el [texto completo de la licencia](vendor/ldcad-shadow/LICENSE.md).

Los archivos derivados se distribuyen bajo CC BY-SA 4.0 con estas atribuciones y una indicación de las transformaciones realizadas:

- `lib/shadow-catalog.json`, `vendor/ldcad-shadow/coverage.json` y `public/catalog/shadow/*.bin`: interpretación de directivas compatibles, expansión de la herencia y de las transformaciones, conversión de coordenadas, diagnósticos y almacenamiento comprimido. Se incluyen [aviso](public/catalog/shadow/NOTICE.txt) y [licencia](public/catalog/shadow/LICENSE.md).
- `lib/generated-assembly.json` y `public/catalog/assembly/*.bin`: selección de uniones estándar verificadas y combinación con envolventes conservadoras derivadas de LDraw. Los perfiles axiales `ldraw-axial-envelope-v1` y `ldraw-keyed-axial-envelope-v1` incorporan además secciones de canales derivadas de las caras originales y descomposición de la envolvente con conservación del material. Los perfiles `ldraw-standard-access-envelope-v1` restan accesos exteriores probados vacíos frente a las caras originales y conservan los demás obstáculos. Los perfiles `ldraw-technic-pin-envelope-v1` incorporan agujeros escalonados y el pin 3673 mediante pruebas sobre las mismas caras de origen; preservan conectores anteriores y conservan el material fuera de vacíos comprobados. Los perfiles `ldraw-minifig-neck-envelope-v1` verifican la geometría superior del cuello de 973 y las paredes y el vacío de receptores compatibles; conservan el material y los conectores anteriores. Los perfiles `ldraw-minifig-hips-envelope-v1` verifican los postes superiores de 3815b y la interfaz inferior de 973, restando únicamente prismas demostrados vacíos y conservando los puertos heredados. Estas transformaciones siguen utilizando las mismas fuentes y atribuciones. Se incluyen [aviso y atribución de ambas fuentes](public/catalog/assembly/NOTICE.txt) y [licencia](public/catalog/assembly/LICENSE.md). Se conservan también las atribuciones y condiciones de la geometría LDraw original descritas arriba.

Los compiladores reproducibles están en `scripts/compile-shadow-catalog.mjs`, `scripts/compile-collision-catalog.mjs` y `scripts/compile-generated-assembly.mjs`; las pruebas geométricas axiales se implementan en `scripts/lib/axial-shaft.mjs`, `scripts/lib/axial-envelope.mjs`, `scripts/lib/keyed-axial-shaft.mjs` y `scripts/lib/keyed-axial-channel.mjs`; los accesos estándar se prueban en `scripts/lib/standard-access.mjs`. Sus comprobaciones de superficies y paredes de soporte son geométricas: no certifican contacto físico exacto, agarre ni tolerancias de fabricación. La disponibilidad de metadatos no significa que sus autores certifiquen la validación de Brickforge, la resistencia física de las construcciones o el soporte completo del catálogo.

Esta identificación de fuentes y archivos derivados no declara que todo el código de Brickforge esté bajo CC BY-SA. Las licencias de los datos, las dependencias y el código propio se documentan por separado; este aviso no sustituye los textos de licencia ni constituye asesoramiento jurídico.

## Dependencias de software

Las versiones exactas de las dependencias directas y transitivas están fijadas en `package-lock.json`. Sus textos de licencia se distribuyen en los paquetes npm instalados. Esta tabla identifica las dependencias principales y no reemplaza la revisión de las dependencias transitivas al redistribuir una compilación.

| Componente | Uso | Licencia declarada por el paquete |
| --- | --- | --- |
| `@modelcontextprotocol/sdk` | Servidor y transportes MCP | MIT |
| `react`, `react-dom` | Interfaz | MIT |
| `three` | Visualización 3D | MIT |
| `lucide-react` | Iconos | ISC |
| `vite`, `@vitejs/plugin-react` | Compilación del cliente | MIT |
| `esbuild` | Compilación del servidor y pruebas | MIT |
| `typescript` | Tipado y herramientas | Apache-2.0 |
| `electron` | Aplicación de escritorio | MIT; incorpora componentes con avisos propios |
| `electron-builder` | Empaquetado de escritorio | MIT |
| `@resvg/resvg-js` | Generación de iconos de escritorio | MPL-2.0 |

Node.js y las imágenes de contenedor tienen sus propias licencias y avisos. Si redistribuyes imágenes o binarios, conserva los avisos que correspondan a esos componentes.

## Código propio de Brickforge

En esta beta no se ha declarado una licencia de distribución para el código propio. La disponibilidad del repositorio no equivale a una licencia de código abierto ni cambia las licencias de terceros. Cualquier autorización sobre el código propio debe proceder de su titular.

## Marca LEGO

LEGO es una marca del Grupo LEGO. Brickforge utiliza el nombre para describir su finalidad: diseñar construcciones de LEGO con IA. Es un proyecto independiente, no afiliado, patrocinado ni aprobado por el Grupo LEGO.
