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

            // Imprimir automáticamente el extracto del día
            try {
                await handleSaleDetails(this.pos, this.hardwareProxy, this.dialog);
            } catch (printError) {
                console.warn("Could not print closing summary:", printError);
                // No bloquear el cierre si falla la impresión
            }

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
