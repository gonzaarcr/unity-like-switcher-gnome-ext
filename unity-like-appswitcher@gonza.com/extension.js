
const { Atk, Clutter, Meta, Shell, St } = imports.gi;

const AltTab = imports.ui.altTab;
const SwitcherPopup = imports.ui.switcherPopup;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Utils = Me.imports.utils;


let injections = {};
let extension = null;

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

// from AltTAb.AppSwitcher
function highlight(n, justOutline) {
	if (this.icons[this._curApp]) {
		if (this.icons[this._curApp].cachedWindows.length == 1)
			this._arrows[this._curApp].hide();
		else
			this._arrows[this._curApp].remove_style_pseudo_class('highlighted');
	}

	// mein
	let previous = this._items[this._highlighted];
	if (previous) {
		let st = previous.get_style();
		previous.set_style(st.substr(0, st.indexOf(';')+1));
	}

	let item = this._items[n];
	if (item) {
		item.set_style(item.get_style() + 'box-shadow: inset 0 0 10px '+ item.colorPalette.lighter + '; border: 2px solid '+ item.colorPalette.lighter + ';');
	}
	// end mein

	// super.highlight(n, justOutline);
	highlight2.call(this, n, justOutline);
	this._curApp = n;

	if (this._curApp != -1) {
		if (justOutline && this.icons[this._curApp].cachedWindows.length == 1)
			this._arrows[this._curApp].show();
		else
			this._arrows[this._curApp].add_style_pseudo_class('highlighted');
	}
}

function _addIcon(appIcon) {
	this.icons.push(appIcon);
	let item = this.addItem(appIcon, appIcon.label);

	item.colorPalette = new Utils.DominantColorExtractor(appIcon.app)._getColorPalette();
	if (item.colorPalette == null) {
		item.colorPalette = {
			original: '#888888',
			lighter: '#ffffff',
			darker: '#000000'
		}
	}
	let hex = item.colorPalette.original;
	let rgb = Utils.ColorUtils._hexToRgb(hex);
	item.set_style('background: rgba('+ rgb.r + ',' + rgb.g + ',' + rgb.b + ', 0.3);');
	// item.set_style('background: '+ item.colorPalette.darker);
	
	appIcon._stateChangedId = appIcon.app.connect('notify::state', app => {
		if (app.state != Shell.AppState.RUNNING)
			this._removeIcon(app);
	});

	let arrow = new St.DrawingArea({ style_class: 'switcher-arrow' });
	arrow.connect('repaint', () => SwitcherPopup.drawArrow(arrow, St.Side.BOTTOM));
	this.add_actor(arrow);
	this._arrows.push(arrow);

	if (appIcon.cachedWindows.length == 1)
		arrow.hide();
	else {
		item.add_accessible_state(Atk.StateType.EXPANDABLE);
		// FIXME workaround to bug
	    appIcon.label.set_style('text-decoration: underline;');
	}
}


// from SwitcherPopup.SwitcherList
function highlight2(index, justOutline) {
	if (this._items[this._highlighted]) {
		this._items[this._highlighted].remove_style_pseudo_class('outlined');
		this._items[this._highlighted].remove_style_pseudo_class('selected');
	}

	if (this._items[index]) {
		if (justOutline)
			this._items[index].add_style_pseudo_class('outlined');
		else
			this._items[index].add_style_pseudo_class('selected');
	}

	this._highlighted = index;

	let adjustment = this._scrollView.hscroll.adjustment;
	let [value] = adjustment.get_values();
	let [absItemX] = this._items[index].get_transformed_position();
	let [result_, posX, posY_] = this.transform_stage_point(absItemX, 0);
	let [containerWidth] = this.get_transformed_size();
	this._scroll(index);
}

function _scroll(index) {
	let adjustment = this._scrollView.hscroll.adjustment;
	let [value, lower_, upper, stepIncrement_, pageIncrement_, pageSize] = adjustment.get_values();

	let n = this._items.length;
	let fakeSize = 2;

	this._scrollableRight = index !== n - 1;
	this._scrollableLeft = index !== 0;
	if (upper === pageSize)
		return;

	let item = this._items[index];
	let sizeItem = (item.allocation.x2 - item.allocation.x1);
	value = (upper - pageSize + sizeItem) * (index / n);
	let maxScrollingAmount = (upper - pageSize);
	let percentaje = (index-fakeSize) / (n - 1 - 2*fakeSize);
	value = percentaje * maxScrollingAmount;

	// special cases
	if (index < fakeSize || percentaje <= 0) {
		this._scrollableLeft = false;
		value = 0;
	} else if (index >= n - fakeSize || percentaje >= 1) {
		this._scrollableRight = false;
		value = maxScrollingAmount;
	}

	adjustment.ease(value, {
		progress_mode: Clutter.AnimationMode.EASE_OUT_EXPO,
		duration: 250, // POPUP_SCROLL_TIME,
		onComplete: () => {
			this.queue_relayout();
		},
	});
}

function _setIconSize() {
	this._iconSize = 96 * 1.5;

	for (let i = 0; i < this.icons.length; i++) {
		if (this.icons[i].icon != null)
			break;
		this.icons[i].set_size(this._iconSize);
	}
}

function addColours() {
	injections.WINDOW_PREVIEW_SIZE = AltTab.WINDOW_PREVIEW_SIZE;
	AltTab.WINDOW_PREVIEW_SIZE = 256;

	injections._setIconSize = AltTab.AppSwitcher.prototype._setIconSize;
	AltTab.AppSwitcher.prototype._setIconSize = _setIconSize;

	injections.highlight = AltTab.AppSwitcher.prototype.highlight;
	AltTab.AppSwitcher.prototype.highlight = highlight;

	injections._addIcon = AltTab.AppSwitcher.prototype._addIcon;
	AltTab.AppSwitcher.prototype._addIcon = _addIcon;


	injections.POPUP_SCROLL_TIME = SwitcherPopup.POPUP_SCROLL_TIME;
	SwitcherPopup.POPUP_SCROLL_TIME = 250;

	injections.highlight2 = SwitcherPopup.SwitcherList.prototype.highlight;
	SwitcherPopup.SwitcherList.prototype.highlight = highlight2;

	injections._scroll = SwitcherPopup.SwitcherList.prototype._scroll;
	SwitcherPopup.SwitcherList.prototype._scroll = _scroll;
}

function removeColours() {
	AltTab.WINDOW_PREVIEW_SIZE = injections.WINDOW_PREVIEW_SIZE;

	AltTab.AppSwitcher.prototype._setIconSize = injections._setIconSize;

	AltTab.AppSwitcher.prototype.highlight = injections.highlight;

	AltTab.AppSwitcher.prototype._addIcon = injections._addIcon;


	SwitcherPopup.POPUP_SCROLL_TIME = injections.POPUP_SCROLL_TIME;
	injections.POPUP_SCROLL_TIME = undefined;

	SwitcherPopup.SwitcherList.prototype.highlight = injections.highlight2;
	injections.highlight2 = undefined;

	SwitcherPopup.SwitcherList.prototype._scroll = injections._scroll; // undefined
	injections._scroll = undefined;
}

function setInitialSelection(argument) {
	if (!injections._finish) {		
		injections._finish = AltTab.AppSwitcherPopup.prototype._finish;
		AltTab.AppSwitcherPopup.prototype._finish = _finish;
	}

	if (!injections._initialSelection) {		
		injections._initialSelection = AltTab.AppSwitcherPopup.prototype._initialSelection;
		AltTab.AppSwitcherPopup.prototype._initialSelection = _initialSelection;
	}
}

function resetInitialSelection(argument) {
	if (injections._finish) {
		AltTab.AppSwitcherPopup.prototype._finish = injections._finish;
		injections._finish = undefined;
	}

	if (injections._initialSelection) {
		AltTab.AppSwitcherPopup.prototype._initialSelection = injections._initialSelection;
		injections._initialSelection = undefined;
	}
}

class Extension {
	constructor(settings) {
		this._settings = settings;

		this._connectSettings();

		this._firstChangeWindowChanged();
	}

	_connectSettings() {
		this._settingsHandlerFirstSwitch = this._settings.connect(
			'changed::first-change-window',
			this._firstChangeWindowChanged.bind(this)
		);
	}

	_firstChangeWindowChanged() {
		this._firstChangeWindow = this._settings.get_boolean('first-change-window');
		if (this._firstChangeWindow) {
			setInitialSelection();
		} else {
			resetInitialSelection();
		}
	}

	destroy() {
		this._disconnectSettings();
		resetInitialSelection();
	}

	_disconnectSettings() {
		this._settings.disconnect(this._settingsHandlerFirstSwitch);
	}
}

function init(metadata) {
}

function enable() {
	const settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
	extension = new Extension(settings);

	addColours();
}

function disable() {
	removeColours();

	extension.destroy();
	extension = null;
}
