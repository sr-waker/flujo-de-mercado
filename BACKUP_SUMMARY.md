# Respaldo del Proyecto: MarketFlow (Última Versión)

Este documento resume la arquitectura y funcionalidades de MarketFlow para su reconstrucción exacta.

## 🚀 Stack Tecnológico
- **Framework:** Next.js 15 (App Router).
- **Backend:** Firebase (Firestore para datos, Auth para sesiones).
- **IA:** Genkit con Google AI (Gemini 2.5 Flash) para análisis de negocio.
- **UI:** React 19, Tailwind CSS, ShadCN UI, Lucide React (iconos).
- **Estilo:** Dark Mode (Charcoal Slate #171E1D), Primary (#299483), Accent (#31BDE5).

## 📦 Módulos Principales

### 1. Punto de Ventas (POS)
- **Buscador/Escáner:** Soporte para códigos de barras (EAN-13) con búsqueda instantánea.
- **Calculadora de Vueltos:** Sistema inteligente en cobros en efectivo (Verde Esmeralda).
- **Cargos Extra:** Permite añadir conceptos como "Bolsas" o "Envío".
- **Precios Variables:** Soporte para productos pesables (Carnicería).
- **Ticket Térmico:** Generador de archivos `.txt` optimizado para 58mm (Formato ASCII con separadores `|`).

### 2. Carnicería (Especializado)
- **Carpetas de Balanza:** Organización por tipos (Vaca, Pollo, Cerdo).
- **Acumulados:** Vista de detalle que suma todas las ventas diarias por carpeta específica.

### 3. Archivo de Fiados
- **Gestión de Deudores:** Carpetas individuales para clientes con tickets pendientes.
- **Lógica Financiera:** Los fiados se marcan como "Pendientes" y NO se suman a la recaudación real hasta ser liquidados.

### 4. Inventario Cloud
- **Control de Stock:** Niveles críticos con alertas visuales (pulsación roja).
- **Calculadora de Bultos:** Herramienta para desglosar precio de costo unitario desde compras mayoristas.
- **IA Product Intel:** Identificación automática de productos por código de barras.

### 5. Compras y Egresos
- **Registro de Mercadería:** Actualiza stock y precios de costo automáticamente.
- **Gastos Operativos:** Registro de servicios, sueldos y alquileres.
- **Deuda Proveedores:** Seguimiento informativo de compromisos pendientes con mayoristas (no afecta balance de caja).

### 6. Reportes e Historial
- **Balance Neto:** Basado en **Recaudación Real** (Efectivo/Tarjeta/Transf) menos **Egresos**.
- **Tarjetas Interactivas:** Clic en "Mercadería" o "Gastos" para abrir el desglose histórico.
- **Filtros Avanzados:** Por método de pago y tipo de ítem (Producto vs Balanza).

## 🔑 Reglas de Negocio Críticas
- **Seguridad:** Reglas de Firestore permiten lectura/escritura a usuarios autenticados para evitar errores de conexión.
- **Sanitización:** Los datos se limpian antes de ir a la nube para evitar errores de `undefined`.
- **VIP:** Sistema de llaves para desbloquear secciones avanzadas (Pase Desarrollador: `developerdospasos`).

---
*MarketFlow - Sistema de Gestión Profesional para Mini-mercados*