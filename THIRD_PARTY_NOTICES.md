# Créditos, licencias y marcas

Este documento identifica materiales de terceros incluidos o utilizados por Brickforge. No sustituye sus textos de licencia ni concede una licencia para el código propio del proyecto.

## LDraw

El catálogo y la geometría proceden de la biblioteca de piezas de **LDraw.org** y de sus autores individuales. Fuente del proyecto: [LDraw.org](https://www.ldraw.org/).

Los archivos LDraw se distribuyen en paquetes JSON comprimidos con gzip dentro de `public/catalog/geometry/*.bin`. El empaquetado cambia el contenedor de distribución; los textos de geometría conservan sus cabeceras de autoría, licencia e historial. El catálogo incluye también la autoría de cada referencia en `public/catalog/parts.json`. Los perfiles de encaje de Brickforge son una representación adicional utilizada por el motor y no sustituyen la geometría ni sus atribuciones.

Consulta los documentos originales incluidos:

- [Acuerdo y guía de atribución](public/catalog/CAreadme.txt)
- [Creative Commons Attribution 2.0](public/catalog/CAlicense.txt)
- [Creative Commons Attribution 4.0 International](public/catalog/CAlicense4.txt)
- [Información de la biblioteca](public/catalog/Readme.txt)

Las condiciones aplicables dependen de la declaración `!LICENSE` de cada archivo y, para archivos con licencia dual, del historial de modificaciones descrito en el acuerdo. No atribuyas una única licencia indiferenciada a toda la biblioteca. Al redistribuir o modificar sus materiales, conserva autores, origen, licencia e indicación de los cambios conforme a las condiciones correspondientes.

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

Node.js y las imágenes de contenedor tienen sus propias licencias y avisos. Si redistribuyes imágenes o binarios, conserva los avisos que correspondan a esos componentes.

## Código propio de Brickforge

En esta beta no se ha declarado una licencia de distribución para el código propio. La disponibilidad del repositorio no equivale a una licencia de código abierto ni cambia las licencias de terceros. Cualquier autorización sobre el código propio debe proceder de su titular.

## Marca LEGO

LEGO es una marca del Grupo LEGO. Brickforge utiliza el nombre para describir su finalidad: diseñar construcciones de LEGO con IA. Es un proyecto independiente, no afiliado, patrocinado ni aprobado por el Grupo LEGO.
