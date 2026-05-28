/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useAsyncLockedMethod } from "@point_of_sale/app/hooks/hooks";
import { _t } from "@web/core/l10n/translation";
import { MoneyDetailsPopup } from "@point_of_sale/app/components/popups/money_details_popup/money_details_popup";
import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";
import { ConnectionLostError } from "@web/core/network/rpc";
import { handleSaleDetails } from "@point_of_sale/app/components/navbar/sale_details_button/sale_details_button";

export class BlindClosingPopup extends Component {
    static components = { Dialog };
    static template = "cierre_caja_ciego.BlindClosingPopup";
    static props = ["close"];

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
        this.hardwareProxy = useService("hardware_proxy");
        this.state = useState({
            moneyCounted: false,
            countedTotal: 0,
            notes: "",
            loading: false,
        });
        this.moneyDetails = null;
        this.confirm = useAsyncLockedMethod(this.confirm.bind(this));
    }

    /**
     * Abre el popup de conteo detallado de billetes y monedas.
     * Esta es la ÚNICA forma de introducir el recuento — no hay campo de texto manual.
     */
    async openDetailsPopup() {
        const action = _t("Cash control - closing");
        this.hardwareProxy.openCashbox(action);
        this.dialog.add(MoneyDetailsPopup, {
            moneyDetails: this.moneyDetails,
            action: action,
            getPayload: (payload) => {
                const { total, moneyDetailsNotes, moneyDetails } = payload;
                this.state.countedTotal = total;
                this.state.moneyCounted = true;
                if (moneyDetailsNotes) {
                    this.state.notes = moneyDetailsNotes;
                }
                this.moneyDetails = moneyDetails;
            },
            context: "Closing",
        });
    }

    /**
     * Verifica que el conteo detallado se haya realizado.
     * "Cerrar Caja" solo se habilita DESPUÉS de contar billetes y monedas.
     */
    canConfirm() {
        return this.state.moneyCounted && !this.state.loading;
    }

    /**
     * Ejecuta la secuencia de cierre de sesión con el total contado.
     * El total se calcula internamente desde MoneyDetailsPopup — nunca se muestra al usuario.
     */
    async confirm() {
        if (!this.state.moneyCounted) return;

        this.state.loading = true;

        try {
            this.pos._resetConnectedCashier();
            const syncSuccess = await this.pos.pushOrdersWithClosingPopup();
            if (!syncSuccess) {
                this.state.loading = false;
                return;
            }

            if (this.pos.config.cash_control) {
                const response = await this.pos.data.call(
                    "pos.session",
                    "post_closing_cash_details",
                    [this.pos.session.id],
                    { counted_cash: this.state.countedTotal }
                );
                if (!response.successful) {
                    this.state.loading = false;
                    return this.handleClosingError(response);
                }
            }

            try {
                await this.pos.data.call("pos.session", "update_closing_control_state_session", [
                    this.pos.session.id,
                    this.state.notes,
                ]);
            } catch (error) {
                if (error?.data?.message !== "This session is already closed.") throw error;
            }

            const response = await this.pos.data.call(
                "pos.session",
                "close_session_from_ui",
                [this.pos.session.id, []]
            );
            if (!response.successful) {
                this.state.loading = false;
                return this.handleClosingError(response);
            }
            this.pos.session.state = "closed";

            // Imprimir extracto del día (hardware proxy o browser print)
            await this.tryPrintSummary();

            this.pos.router.close();
        } catch (error) {
            if (error instanceof ConnectionLostError) {
                throw error;
            }
            console.error("Blind closing session failed:", error);
            const msg = error?.message
                || error?.data?.message
                || error?.data?.debug
                || _t("An error has occurred when trying to close the session.");
            this.dialog.add(Dialog, {
                title: _t("Closing session error"),
                body: msg,
            });
        } finally {
            this.state.loading = false;
            localStorage.removeItem(`pos.session.${odoo.pos_config_id}`);
        }
    }

    async handleClosingError(response) {
        this.dialog.add(Dialog, {
            title: response.title || _t("Error"),
            body: response.message,
        });
    }

    cancel() {
        this.props.close();
    }

    /**
     * Imprime el extracto del día.
     * 1) Hardware proxy (impresora POS física) si está conectada
     * 2) Browser print: renderiza el reporte HTML y abre el diálogo de impresión
     */
    /**
     * Imprime el extracto del día con los datos locales del POS.
     * 1) Hardware proxy (impresora POS física) si está conectada
     * 2) Browser print: construye HTML con los datos de las órdenes locales
     */
    async tryPrintSummary() {
        // 1) Hardware proxy printer
        if (this.hardwareProxy.printer) {
            try {
                await handleSaleDetails(this.pos, this.hardwareProxy, this.dialog);
                return;
            } catch (printError) {
                console.warn("POS printer failed:", printError);
            }
        }

        // 2) Browser print: agregar datos desde los modelos locales del POS
        try {
            const session = this.pos.session;
            const fmt = this.pos.env.utils.formatCurrency;
            const orders = this.pos.models["pos.order"].filter(
                (o) => o.session_id?.id === session.id && o.finalized
            );
            const currency = this.pos.currency;

            // Agrupar pagos por método
            const paymentTotals = {};
            for (const order of orders) {
                for (const payment of order.payment_ids || []) {
                    const methodName = payment.payment_method_id?.name || _t("Unknown");
                    paymentTotals[methodName] = (paymentTotals[methodName] || 0) + (payment.amount || 0);
                }
            }

            const totalAmount = orders.reduce((sum, o) => sum + (o.amount_total || 0), 0);
            const now = new Date().toLocaleString();

            // Construir HTML del resumen
            let html = `<html><head><title>Extracto - ${session.name}</title>`;
            html += `<style>
                body { font-family: monospace; font-size: 13px; padding: 20px; max-width: 320px; margin: auto; }
                h2 { text-align: center; margin-bottom: 5px; }
                .header { text-align: center; color: #666; margin-bottom: 20px; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; }
                td { padding: 3px 0; }
                .label { text-align: left; }
                .value { text-align: right; }
                .sep { border-top: 1px dashed #999; }
                .total td { font-weight: bold; font-size: 15px; padding-top: 8px; }
                .title-row td { font-weight: bold; padding-top: 12px; color: #333; }
                .footer { text-align: center; color: #999; font-size: 10px; margin-top: 20px; }
            </style></head><body>`;
            html += `<h2>${session.name}</h2>`;
            html += `<div class="header">${now}<br/>`;
            html += `${orders.length} pedido(s) · ${_t("Closed")}</div>`;

            // Pagos por método
            html += `<table>`;
            html += `<tr class="title-row"><td colspan="2">${_t("Payments")}</td></tr>`;
            const paymentNames = Object.keys(paymentTotals);
            if (paymentNames.length === 0) {
                html += `<tr><td class="label" colspan="2" style="color: #999;">${_t("No payments")}</td></tr>`;
            } else {
                for (const name of paymentNames) {
                    html += `<tr><td class="label">${name}</td><td class="value">${fmt(paymentTotals[name], false)}</td></tr>`;
                }
            }

            // Total
            html += `<tr><td colspan="2" class="sep"></td></tr>`;
            html += `<tr class="total"><td>${_t("Total")}</td><td class="value">${fmt(totalAmount, false)}</td></tr>`;
            html += `</table>`;

            // Info de cierre
            if (this.state.notes) {
                html += `<div class="footer">${_t("Closing note")}: ${this.state.notes}</div>`;
            }
            html += `<div class="footer">Sesión ID: ${session.id}</div>`;
            html += `</body></html>`;

            const printWindow = window.open("", "_blank", "width=380,height=500");
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => printWindow.print(), 500);
            }
        } catch (browserError) {
            console.warn("Browser print fallback also failed:", browserError);
        }
    }
}

// Patch PosStore.closeSession para abrir BlindClosingPopup DIRECTAMENTE
// sin pasar por ClosePosPopup. Esto evita el flash del popup original
// que se veía durante milisegundos en VPS con mayor latencia.
patch(PosStore.prototype, {
    async closeSession() {
        try {
            const status = await this.data.call(
                "pos.config",
                "check_blind_closing_status",
                [this.config.id]
            );

            if (status.blind_closing_active && !status.is_manager) {
                this.dialog.add(BlindClosingPopup);
                return;
            }
        } catch (e) {
            console.warn("Blind closing status check failed, using default flow:", e);
        }

        // Blind closing no activo o error: flujo normal
        const info = await this.getClosePosInfo();
        if (info) {
            this.dialog.add(ClosePosPopup, info);
        }
    }
});
