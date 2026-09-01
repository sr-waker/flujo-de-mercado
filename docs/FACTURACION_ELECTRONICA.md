# Guía de Facturación Electrónica ARCA (AFIP)

Esta guía explica los componentes necesarios para integrar MarketFlow con los servicios de facturación legal de Argentina.

## 1. Los Archivos Críticos

### La Llave Privada (`.key`)
Es un archivo secreto que generas en tu computadora. **Nunca debe compartirse ni subirse al frontend.** Se utiliza para firmar los pedidos de autorización de facturas.

### El Certificado Digital (`.crt`)
Es el archivo que te entrega ARCA. Es la prueba de que tu CUIT está vinculado a tu llave privada y que tienes permiso para facturar.

## 2. Cómo obtener el Certificado .crt

1. **Generar la clave privada y el pedido (CSR):**
   Usa OpenSSL para generar ambos:
   ```bash
   openssl genrsa -out privada.key 2048
   openssl req -new -key privada.key -subj "/C=AR/O=NombreNegocio/CN=MarketFlow/serialNumber=CUIT20XXXXXXXX9" -out pedido.csr
   ```

2. **Acceder a AFIP:**
   - Entra con Clave Fiscal Nivel 3.
   - Ve a "Administración de Certificados Digitales".
   - Sube el archivo `pedido.csr`.

3. **Descarga:**
   - Una vez procesado, descarga el archivo `.crt`.

4. **Delegación:**
   - Ve a "Administrador de Relaciones de Clave Fiscal".
   - Busca el servicio "Web Service Factura Electrónica" (WSFE).
   - Delega el permiso a tu nuevo certificado.

## 3. Implementación Técnica en MarketFlow

Para activar esto en el código:
1. Instalar la librería `afip.js`.
2. Crear un **Server Action** en Next.js que reciba los datos de la venta.
3. El servidor usará la `.key` y el `.crt` (guardados como variables de entorno seguras) para pedir el **CAE**.
4. Guardar el CAE en Firestore junto con el ticket.
