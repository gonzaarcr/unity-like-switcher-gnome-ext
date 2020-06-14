/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */

const { Meta, Shell } = imports.gi;

const AltTab = imports.ui.altTab;
const SwitcherPopup = imports.ui.switcherPopup;


let injections = {};

// https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/master/js/ui/altTab.js#L272
function _finish(timestamp) {
	this._currentWindow = this._currentWindow < 0 ? 0 : this._currentWindow;
	return injections._finish.call(this, timestamp);
}


// https://gitlab.gnome.org/GNOME/gnome-shell/commit/092e1a691d57a3be205100f7d3910534d3c59f84
function _initialSelection(backward, binding) {
	if (backward || binding != 'switch-applications'
			|| this._items.length == 0  || this._items[0].cachedWindows.length < 2) {
		injections._initialSelection.call(this, backward, binding);
		return;
	}

	let ws = global.workspace_manager.get_active_workspace();
	let wt = Shell.WindowTracker.get_default();
	let tab_list = global.display.get_tab_list(Meta.TabList.NORMAL, ws);

	let currentApp = wt.get_window_app(tab_list[0]);
	let secondApp = wt.get_window_app(tab_list[1]);

	if (currentApp == secondApp) {
		this._select(0, 1);
	} else {
		injections._initialSelection.call(this, backward, binding);
	}
}


function init(metadata) {
}


function enable() {
	injections._finish = AltTab.AppSwitcherPopup.prototype._finish;
	AltTab.AppSwitcherPopup.prototype._finish = _finish;

	injections._initialSelection = AltTab.AppSwitcherPopup.prototype._initialSelection;
	AltTab.AppSwitcherPopup.prototype._initialSelection = _initialSelection;
}


function disable() {
	let prop;
	for(prop in injections) {
		AltTab.AppSwitcherPopup.prototype[prop] = injections[prop];
	}
}
