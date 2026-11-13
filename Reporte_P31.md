# Programacion WEB II

## Reporte de Auditoría y Optimización Web (Ceti-Verso E-Commerce)

| Campos | Valor |
| --- | --- |
| Maestro | Octavio Villavicencio Cruz |
| Alumno | Jonathan Gabriel Marmolejo Olaguez |
| Registro | 23300714 |
| Grado y Grupo | 7D |
| Fecha | 12/11/2026 |

---
## Marco Teórico

### ¿Qué es Google Lighthouse?
Google Lighthouse es una herramienta automatizada de codigo abierto desarrollada por Google para mejorar la calidad de las páginas web. Se puede ejecutar directamente desde Opera DevTools, desde la línea de comandos o como un módulo de Node.js. Su función principal es auditar una URL bajo condiciones simuladas y generar un informe detallado con métricas, diagnósticos y posibles de mejoras.

### Categorías de Auditoría en Lighthouse
Lighthouse evalúa las aplicaciones web puntuados del 0 al 100 :
1. **Performance:** Mide la velocidad con la que el contenido se carga, se vuelve visible y responde a las interacciones del usuario.
2. **Accessibility :** Evalúa qué tan fácil es para personas con discapacidades navegar e interactuar con el sitio mediante tecnologías de asistencia como lectores de pantalla.
3. **Best Practices:** Verifica la seguridad y salud general del código moderno.
4. **SEO:** Comprueba que la página cumpla con los requisitos técnicos básicos para que los motores de búsqueda puedan rastrearla, indexarla y comprender su contenido correctamente.

### Core Web Vitals 
Son un subconjunto de métricas especificas dentro de la categoria de Performance que Google considera criticas para medir la experiencia real del usuario en la web:

* **LCP:** Mide el tiempo que tarda en renderizarse el elemento visual más grande (una imagen principal, un video o un bloque grande de texto) dentro del área visible (*viewport*) desde que el usuario solicita la página.
  * Umbral ideal: <2.6 segundos
* **INP:** Evalúa la capacidad de respuesta general de una página ante las interacciones del usuario (clics, toques en pantalla o pulsaciones de teclas) durante toda su visita, midiendo la latencia desde que ocurre la acción hasta que el navegador actualiza visualmente la interfaz. *
  * Umbral ideal: <200 milisegundos
* **CLS:** Mide la estabilidad visual de la página. Cuantifica cuánto se mueven de forma inesperada los elementos visibles mientras la página termina de cargar (por ejemplo, cuando una imagen sin dimensiones definidas empuja un botón hacia abajo justo cuando el usuario iba a hacer clic).
  * Umbral ideal: < 0.1

### ¿Qué es WCAG?
Las WCAG son un conjunto de estándares internacionales desarrollados por el consorcio W3C a través de su Iniciativa de Accesibilidad Web (WAI). Su objetivo es establecer recomendaciones tecnicas para hacer que el contenido web sea accesible para personas con diversas discapacidades. Se organizan bajo cuatro principios clave (POUR): el contenido debe ser **Perceptible**, **Operable**, **Comprensible** y **Robusto**, clasificando su cumplimiento en tres niveles de conformidad: **A** (básico), **AA** (estándar legal y recomendado) y **AAA** (máximo).

---

## Diseño y Planeación

### Tabla Comparativa: Antes y despues de la auditoria

| Página Auditada | Métrica | Antes (Sin Optimizar) | Después (Optimizado) | Mejora Obtenida |
| :--- | :--- | :---: | :---: | :---: |
| **Inicio (`/`)** | **Performance** | 50 | **95** | +45 |
| | **Accessibility** | 95 | **100** | +5 |
| | **SEO** | 91 | **100** |+9 |
| | **Best Practices** | *92* | **100** | +8 |
| **Categoría (`/category/[id]`)** | **Performance** | 61 | **95** | +34 |
| | **Accessibility** | 93 | **100** |+7|
| | **SEO** | 91 | **100** | +9 |
| |**Best Practices** | *92* | **100** |  +8|
| **Detalle Producto (`/product/[id]`)** | **Performance** | 38 | **95** | +57 |
| | **Accessibility** | 93 | **100** | +7 |
| | **SEO** | 91 | **100** |+9 |
||**Best Practices** | *92* | **100** | +8 |
---

//Nota: se consiguio 100 tambien en performance solo que ya no tome captura de esas ultimas auditorias
### Checklist de Arreglos Aplicados

#### Rendimiento y Arquitectura (Performance)
- [x] **Migración a entorno de producción real:** Instalación manual de @astrojs/node en modo standalone (--legacy-peer-deps) para compilar (npm run build) y auditar código minificado y empaquetado sin la sobrecarga del servidor de desarrollo de Vite.     

- [x] **Eliminación de recursos pesados bloqueantes:** Remoción de archivos .gif animados de gran peso en la barra superior (TopBar), reduciendo drásticamente el tiempo de descarga y el bloqueo del hilo principal.
- [x] **Inyección de CSS Inline:** Integración de estilos directamente dentro de etiquetas style en componentes clave como Hero.astro en lugar de importar hojas CSS externas, evitando bloqueos de renderizado en la primera pintura.
- [x] **Priorización inteligente de imágenes (LCP):** Implementación de la propiedad priority en ProductCard.astro para aplicar loading="eager" y fetchpriority="high" exclusivamente en el primer elemento visible (index === 0), manteniendo loading="lazy" para el resto del catálogo.
- [x] **Precarga nativa de recursos en SSR:** Uso de link rel="preload" as="image" fetchpriority="high" en el head de vistas dinámicas (/product/[id]) para que el navegador descubra la imagen principal antes de que React hidrate el componente.

#### Accesibilidad y Estándares (WCAG)
- [x] **Nombres discernibles en enlaces iconográficos:** Incorporación de atributos aria-label="Historial de pedidos" y title en los botones compuestos únicamente por vectores svg dentro de TopBar.tsx, cumpliendo con los criterios de comprensibilidad para lectores de pantalla.

---

## Conclusión

### ¿Qué aprendiste?
Comprendí que medir el rendimiento web en un entorno de desarrollo arroja métricas distorsionadas debido a la falta de minificación y a la inyección de herramientas de depuración. Aprendí cómo funciona la ruta crítica de renderizado del navegador: cómo un un GIF pesado pueden afectar el lcp, y cómo la arquitectura de islas de Astro permite combinar renderizado en servidor (SSR) rápido con interactividad selectiva mediante React y Zustand.

### Dificultades encontradas y cómo se resolvieron
1. **Descubrimiento tardío de imágenes en componentes hidratados:** En las vistas de catálogo y detalle de producto, las imágenes tardaban en ser detectadas por el navegador. Se solucionó pasando el índice del arreglo en el servidor para asignar prioridad alta solo al primer elemento y utilizando etiquetas en el documento HTML inicial.
2. **Advertencias de JavaScript no utilizado y extensiones:** Identifiqué que las extensiones del navegador local afectan las auditorías de Lighthouse y que los runtimes de hidratación que deben limitarse únicamente a los componentes que requieren estado interactivo.

### Aplicación al Proyecto Final (PF - E-Commerce)
Todo se integrara como estandar de calidad en el desarrollo continuo de Ceti-Verso