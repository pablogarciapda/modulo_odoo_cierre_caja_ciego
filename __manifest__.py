{
    'name': 'TPV Cierre de Caja Ciego',
    'version': '19.0.1.0.0',
    'author': 'Pablo García Fernández',
    'website': 'https://github.com/pablogarciapda',
    'license': 'LGPL-3',
    'category': 'Point of Sale',
    'summary': 'Cierre de caja ciego: oculta totales y fuerza conteo manual.',
    'description': """
        Modifica el popup de cierre de caja del TPV para ocultar todos
        los totales esperados y forzar un recuento manual a ciegas.
        
        Características:
        - Al activar el check en configuración del TPV, al cerrar caja
          no se ven movimientos ni cifras.
        - El empleado cuenta billetes y monedas mediante el botón de
          conteo detallado.
        - Al cerrar, imprime automáticamente un extracto del día con
          productos, pagos, impuestos y totales.
        - Grupo "Manager de Cierre Ciego" para usuarios que sí pueden
          ver los totales.
    """,
    'depends': [
        'point_of_sale',
        'l10n_es',
    ],
    'data': [
        'security/ir.model.access.csv',
        'security/security_rules.xml',
        'views/pos_config_views.xml',
    ],
    'assets': {
        'point_of_sale.assets_prod': [
            'cierre_caja_ciego/static/src/js/BlindClosingPopup.js',
            'cierre_caja_ciego/static/src/xml/BlindClosingPopup.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
