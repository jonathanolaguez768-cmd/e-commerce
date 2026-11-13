# CetiVerso  E-Commerce

##  Prerrequisitos

Asegúrate de contar con las siguientes herramientas instaladas en tu equipo:
* **Node.js** (Versión 18.x o superior)
* **npm** 
* **bun**
* **docker-desktop**
---

##  Instalación y Configuración

Clona el repositorio e ingresa a la carpeta del frontend:
```bash
   cd front
   ```
Instala las dependencias del proyecto:  
```bash
   npm install 
```   
Configura las variables de entorno creando un archivo .env en la raíz de la carpeta front/ apuntando a tu backend de Hono/Node:
```bash
   PUBLIC_API_URL=http://localhost:3000
```
Ingresa a la carpeta del backend:
```bash
   cd back
   ```
Instala las dependencias del proyecto:  
```bash
   bun install 
```  
Compila el proyecto en front/:
```bash
   npm run dev
```
Compila el proyecto en back/:
```bash
   bun run dev
```
Levanta el contenedor de el proyecto en /:
```bash
   docker-compose up -d
```     
**`Finalmente accedes a la url que te brinda el frontend`**

---
##  Lighthose

Página de Inicio (/)

Qué evalúa: La carga inicial del banner principal (Hero), la correcta optimización de estilos críticos y el renderizado general del catálogo inicial.

Página de Categoría (/category/[id])

Qué evalúa: La priorización de imágenes de los productos (fetchpriority="high", loading="eager") en el primer plano y la correcta gestión de tarjetas de productos.

Página de Detalle de Producto (/product/[id])

Qué evalúa: La respuesta en servidor (SSR), la precarga de recursos críticos mediante enlaces `<link rel="preload">` y la hidratación eficiente de componentes interactivos de React (ProductDetail).
