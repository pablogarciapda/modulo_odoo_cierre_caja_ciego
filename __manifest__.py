{
    'name': 'TPV Cierre de Caja Ciego',
    'version': '19.0.1.0.0',
    'author': 'Pablo García Fernández',
    'website': 'https://github.com/pablogarciapda',
    'license': 'LGPL-3',
    'category': 'Point of Sale',
    'summary': 'Implementa la funcionalidad de cierre de caja ciego en el TPV.',
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
