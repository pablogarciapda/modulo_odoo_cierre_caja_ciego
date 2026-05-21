# -*- coding: utf-8 -*-
from odoo import api, fields, models

class PosConfig(models.Model):
    _inherit = 'pos.config'

    l10n_es_blind_cash_closing = fields.Boolean(
        string='Cierre de Caja Ciego',
        help='Si está marcado, los empleados no podrán ver los totales esperados al cerrar la caja, forzando un conteo a ciegas.',
        default=False
    )

    def check_blind_closing_status(self):
        """Método RPC que devuelve el estado del cierre ciego para el usuario actual."""
        self.ensure_one()
        group_xmlid = 'cierre_caja_ciego.group_pos_blind_closing_manager'
        return {
            'blind_closing_active': self.l10n_es_blind_cash_closing,
            'is_manager': self.env.user.has_group(group_xmlid),
        }
