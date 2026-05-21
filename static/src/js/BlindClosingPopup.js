/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useAsyncLockedMethod } from "@point_of_sale/app/hooks/hooks";
import { _t } from "@web/core/l10n/translation";
import { parseFloat } from "@web/views/fields/parsers";
import { Input } from "@point_of_sale/app/components/inputs/input/input";
import { MoneyDetailsPopup } from "@point_of_sale/app/components/popups/money_details_popup/money_details_popup";
import { patch } from "@web/core/utils/patch";
import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";

export class BlindClosingPopup extends Component {
    static components = { Dialog, Input };
    static template = "cierre_caja_ciego.BlindClosingPopup";
    static props = ["close"];

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
        this.ui = useService("ui");
        this.hardwareProxy = useService("hardware_proxy");
        this.state = useState({
            manualCashInput: "0",
            notes: "",
            loading: false,
        });
        this.moneyDetails = null;
        this.confirm = useAsyncLockedMethod(this.confirm.bind(this));
    }

    async openDetailsPopup() {
        const action = _t("Cash control - closing");
        this.hardwareProxy.openCashbox(action);
        this.dialog.add(MoneyDetailsPopup, {
            moneyDetails: this.moneyDetails,
            action: action,
            getPayload: (payload) => {
                const { total, moneyDetailsNotes, moneyDetails } = payload;
                this.state.manualCashInput = this.env.utils.formatCurrency(total, false);
                if (moneyDetailsNotes) {
                    this.state.notes = moneyDetailsNotes;
                }
                this.moneyDetails = moneyDetails;
            },
            context: "Closing",
        });
    }

    async confirm() {
        if (!this.env.utils.isValidFloat(this.state.manualCashInput)) {
            this.dialog.add(Dialog, {
                title: _t("Error"),
                body: _t("Por favor, introduzca un importe válido."),
            });
            return;
        }

        this.state.loading = true;

        try {
            this.pos._resetConnectedCashier();
            const syncSuccess = await this.pos.pushOrdersWithClosingPopup();
            if (!syncSuccess) {
                this.state.loading = false;
                return;
            }

            if (this.pos.config.cash_control) {
                const countedCash = this.env.utils.parseValidFloat(this.state.manualCashInput);
                const response = await this.pos.data.call(
                    "pos.session",
                    "post_closing_cash_details",
                    [this.pos.session.id],
                    { counted_cash: countedCash }
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
                if (!error.data || error.data.message !== "This session is already closed.") throw error;
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
            this.pos.router.close();
        } catch (error) {
            console.error("Blind closing session failed:", error);
            const msg = error?.message || error?.data?.message || error?.data?.debug || _t("An error has occurred when trying to close the session.");
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

// Patch ClosePosPopup to redirect to our popup when blind closing is active
patch(ClosePosPopup.prototype, {
    async setup() {
        super.setup(...arguments);
        
        try {
            const status = await this.pos.data.call(
                "pos.config",
                "check_blind_closing_status",
                [this.pos.config.id]
            );
            
            if (status.blind_closing_active && !status.is_manager) {
                this.props.close();
                this.dialog.add(BlindClosingPopup);
            }
        } catch (e) {
            console.warn("Blind closing status check failed:", e);
        }
    }
});
