# Seguridad — beta

Brickforge es una beta para diseñar construcciones LEGO con IA. No es una plataforma multiusuario ni un servicio endurecido para acceso anónimo por Internet.

## Acceso y datos

- Por defecto escucha en `127.0.0.1:3100`, sin clave. Los programas de tu equipo pueden acceder al espacio de trabajo; no lo uses así en un equipo compartido con usuarios no confiables.
- Fuera de loopback exige `BRICKFORGE_TOKEN` de al menos 32 caracteres y `PUBLIC_ORIGIN`. Genera una clave aleatoria, usa HTTPS mediante un proxy y conserva Host y Origin.
- HTTP admite Bearer y la web una cookie HttpOnly, SameSite=Strict, de 12 horas. Con origen público HTTPS, la cookie usa Secure. Rotar la clave invalida las sesiones.
- El transporte stdio tiene los permisos del usuario que lo ejecuta y accede directamente al SQLite. Conéctalo solo a clientes de confianza.
- Todas las conexiones comparten el mismo espacio de trabajo. Dar acceso a una IA permite leer y modificar sus construcciones. La aplicación controla encajes y revisiones; no implementa permisos de solo lectura por cliente.
- Los modelos se guardan en SQLite local. Los archivos de base de datos y copias de seguridad no están cifrados por la aplicación; aplica permisos y copias adecuados en el sistema operativo.

## Antes de publicar código

`.gitignore` excluye bases de datos, modelos privados, copias, credenciales, configuraciones locales y compilaciones. `.env.example` solo documenta opciones, sin una clave real.

```sh
git add .
npm run check:repository
npm audit
npm run typecheck
npm run build
npm test
git diff --cached --stat
```

El guard comprueba el contenido exacto del índice Git, incluidos los paquetes gzip del catálogo, y no imprime valores que parezcan secretos. Detecta patrones conocidos y rutas prohibidas; no sustituye una revisión humana ni garantiza la ausencia absoluta de credenciales.

No añadas archivos privados mediante `git add -f`. Publica un ZIP creado desde un commit revisado con `git archive`, no comprimiendo toda tu carpeta de trabajo.

## Notificar un problema

No publiques claves, cookies, archivos `.env`, bases de datos ni modelos privados en issues. Contacta con el propietario del repositorio por un canal privado para comunicar vulnerabilidades. Si se ha filtrado una clave, revócala o rótala antes de limpiar el historial: borrar el archivo del último commit no elimina el secreto de commits anteriores.

## Límites operativos

No incluye OAuth, gestión de equipos, protección avanzada frente a denegación de servicio, cuotas por cliente ni auditoría de cambios por usuario. Para acceso remoto, limita los clientes autorizados y aplica límites de tráfico en tu proxy. La revisión de dependencias y el escaneo deben repetirse antes de cada publicación.
