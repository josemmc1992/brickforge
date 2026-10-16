# Contribuir a Brickforge

Brickforge está en **beta (0.1.0-beta.1)**. Su objetivo es permitir **diseñar LEGO con IA**, con un editor visual y un motor que controle los encajes para todos los clientes.

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

Para ampliar piezas construibles, define su perfil y conectores, documenta los límites y añade pruebas de encaje válido, colisión, ocupación, rotación y apoyo. Verifica especialmente los orígenes asimétricos y las superficies con huecos. Consulta [Arquitectura](docs/ARCHITECTURE.md).

## Proponer un cambio

Describe el problema, el comportamiento resultante y cómo lo has verificado. Mantén el cambio acotado y actualiza los esquemas MCP o la documentación cuando corresponda. Ejecuta `npm run typecheck`, `npm run build` y `npm test` antes de solicitar revisión. Si cambias Docker, verifica el arranque real y la persistencia del contenedor; compilar TypeScript no comprueba ese mecanismo.

No incluyas `node_modules`, compilados, credenciales, bases, backups ni archivos de tu entorno. Respeta las cabeceras, autores y licencias al añadir o modificar geometría LDraw.
