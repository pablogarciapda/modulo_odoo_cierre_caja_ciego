# TPV Cierre de Caja Ciego

Módulo para Odoo 19 que modifica el popup de cierre de caja del TPV.
Cuando está activo, oculta todos los totales esperados y obliga al empleado a
realizar un conteo manual de billetes y monedas. Al cerrar, imprime un extracto
con el resumen del día.

## Autor

Pablo García Fernández · https://github.com/pablogarciapda

## Dependencias

- `point_of_sale`
- `l10n_es`

## Funcionalidad

1. Agrega el campo **"Cierre de Caja Ciego"** en la configuración del TPV
   (`pos.config`).
2. Cuando está activo, al cerrar caja se muestra un popup **sin cifras**:
   - No se ven totales esperados, movimientos, ni diferencias.
   - Solo un botón grande para hacer el conteo detallado de billetes/monedas.
3. El conteo detallado permite ingresar cuántos billetes y monedas hay de cada
   denominación.
4. Un grupo de seguridad **"Manager de Cierre Ciego"** permite a ciertos
   usuarios ver los totales incluso con el modo ciego activo.
5. Al cerrar la sesión se imprime automáticamente un extracto del día:
   productos vendidos, pagos por método, impuestos, total.
   - Si hay impresora POS conectada → imprime ticket.
   - Si no → abre ventana del navegador para imprimir.

## Instalación

1. Agregar a `addons_path`.
2. Instalar desde Apps.
3. Ir a TPV → Configuración → activar "Cierre de Caja Ciego" en el punto de venta.
4. Asignar grupo "Manager de Cierre Ciego" a usuarios que deban ver totales.

## Archivos importantes

| Archivo | Descripción |
|---------|------------|
| `models/pos_config.py` | Campo booleano + método RPC check_blind_closing_status |
| `security/security_rules.xml` | Grupo de seguridad Manager |
| `static/src/js/BlindClosingPopup.js` | Componente OWL del popup ciego |
| `static/src/xml/BlindClosingPopup.xml` | Template del popup sin cifras |
| `views/pos_config_views.xml` | Checkbox en configuración del TPV |

## Versión

19.0.1.0.0 · Licencia LGPL-3
