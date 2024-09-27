import Atk from "gi://Atk";
import Clutter from "gi://Clutter";
import Meta from "gi://Meta";
import St from "gi://St";

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import * as SwitcherPopup from 'resource:///org/gnome/shell/ui/switcherPopup.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Utils from './utils.js';


const baseIconSizes = [96, 64, 48, 32, 22];


let injections = {};
let extension = null;

function getWindows(workspace) {
	// We ignore skip-taskbar windows in switchers, but if they are attached
	// to their parent, their position in the MRU list may be more appropriate
	// than the parent; so start with the complete list ...
	let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace);
	// ... map windows to their parent where appropriate ...
	return windows.map(w => {
		return w.is_attached_dialog() ? w.get_transient_for() : w;
	// ... and filter out skip-taskbar windows and duplicates
	}).filter((w, i, a) => !w.skip_taskbar && a.indexOf(w) === i);
}

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
	// AltTab.WINDOW_PREVIEW_SIZE = 256;

	// injections._setIconSize = AltTab.AppSwitcher.prototype._setIconSize;
	// AltTab.AppSwitcher.prototype._setIconSize = _setIconSize;

	// injections.highlight = AltTab.AppSwitcher.prototype.highlight;
	// AltTab.AppSwitcher.prototype.highlight = highlight;

	// injections._addIcon = AltTab.AppSwitcher.prototype._addIcon;
	// AltTab.AppSwitcher.prototype._addIcon = _addIcon;
	injections._init = AltTab.AppSwitcherPopup.prototype._init;
	AltTab.AppSwitcherPopup.prototype._init = _init;

	// injections.POPUP_SCROLL_TIME = SwitcherPopup.POPUP_SCROLL_TIME;
	// SwitcherPopup.POPUP_SCROLL_TIME = 250;

	injections.highlight2 = SwitcherPopup.SwitcherList.prototype.highlight;
	SwitcherPopup.SwitcherList.prototype.highlight = highlight2;

	injections._scroll = SwitcherPopup.SwitcherList.prototype._scroll;
	SwitcherPopup.SwitcherList.prototype._scroll = _scroll;
}

function removeColours() {
	// AltTab.WINDOW_PREVIEW_SIZE = injections.WINDOW_PREVIEW_SIZE;

	// AltTab.AppSwitcher.prototype._setIconSize = injections._setIconSize;

	// AltTab.AppSwitcher.prototype.highlight = injections.highlight;

	// AltTab.AppSwitcher.prototype._addIcon = injections._addIcon;
	AltTab.AppSwitcherPopup.prototype._init = injections._init;


	// SwitcherPopup.POPUP_SCROLL_TIME = injections.POPUP_SCROLL_TIME;
	// injections.POPUP_SCROLL_TIME = undefined;

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

class MyExtension {
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

export default class UnityLikeAppSwitcherExtension extends Extension {
	enable() {
		const settings = this.getSettings();
		extension = new MyExtension(settings);

		addColours();
	}

	disable() {
		removeColours();

		extension.destroy();
		extension = null;
	}
}

function _init() {
	SwitcherPopup.SwitcherPopup.prototype._init.call(this);

	this._thumbnails = null;
	this._thumbnailTimeoutId = 0;
	this._currentWindow = -1;

	this.thumbnailsVisible = false;

	let apps = Shell.AppSystem.get_default().get_running();

	this._switcherList = new AppSwitcher(apps, this);
	this._items = this._switcherList.icons;
}

const AppSwitcher = GObject.registerClass(
class AppSwitcher extends SwitcherPopup.SwitcherList {
	_init(apps, altTabPopup) {
		super._init(true);

		this.icons = [];
		this._arrows = [];

		let windowTracker = Shell.WindowTracker.get_default();
		let settings = new Gio.Settings({schema_id: 'org.gnome.shell.app-switcher'});

		let workspace = null;
		if (settings.get_boolean('current-workspace-only')) {
			let workspaceManager = global.workspace_manager;

			workspace = workspaceManager.get_active_workspace();
		}

		let allWindows = getWindows(workspace);

		// Construct the AppIcons, add to the popup
		for (let i = 0; i < apps.length; i++) {
			let appIcon = new AltTab.AppIcon(apps[i]);
			// Cache the window list now; we don't handle dynamic changes here,
			// and we don't want to be continually retrieving it
			appIcon.cachedWindows = allWindows.filter(
				w => windowTracker.get_window_app(w) === appIcon.app);
			if (appIcon.cachedWindows.length > 0)
				this._addIcon(appIcon);
		}

		this._altTabPopup = altTabPopup;
		this._delayedHighlighted = -1;
		this._mouseTimeOutId = 0;

		this.connect('destroy', this._onDestroy.bind(this));
	}

	_onDestroy() {
		if (this._mouseTimeOutId !== 0)
			GLib.source_remove(this._mouseTimeOutId);

		this.icons.forEach(
			icon => icon.app.disconnectObject(this));
	}

	_setIconSize() {
		let j = 0;
		while (this._items.length > 1 && this._items[j].style_class !== 'item-box')
			j++;

		let themeNode = this._items[j].get_theme_node();
		this._list.ensure_style();

		let iconPadding = themeNode.get_horizontal_padding();
		let iconBorder = themeNode.get_border_width(St.Side.LEFT) + themeNode.get_border_width(St.Side.RIGHT);
		let [, labelNaturalHeight] = this.icons[j].label.get_preferred_height(-1);
		let iconSpacing = labelNaturalHeight + iconPadding + iconBorder;
		let totalSpacing = this._list.spacing * (this._items.length - 1);

		// We just assume the whole screen here due to weirdness happening with the passed width
		let primary = Main.layoutManager.primaryMonitor;
		let parentPadding = this.get_parent().get_theme_node().get_horizontal_padding();
		let availWidth = primary.width - parentPadding - this.get_theme_node().get_horizontal_padding();

		let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
		let iconSizes = baseIconSizes.map(s => s * scaleFactor);
		let iconSize = baseIconSizes[0];

		if (this._items.length > 1) {
			for (let i =  0; i < baseIconSizes.length; i++) {
				iconSize = baseIconSizes[i];
				let height = iconSizes[i] + iconSpacing;
				let w = height * this._items.length + totalSpacing;
				if (w <= availWidth)
					break;
			}
		}

		this._iconSize = iconSize;

		for (let i = 0; i < this.icons.length; i++) {
			if (this.icons[i].icon != null)
				break;
			this.icons[i].set_size(iconSize);
		}
	}

	vfunc_get_preferred_height(forWidth) {
		if (!this._iconSize)
			this._setIconSize();

		return super.vfunc_get_preferred_height(forWidth);
	}

	vfunc_allocate(box) {
		// Allocate the main list items
		super.vfunc_allocate(box);

		let contentBox = this.get_theme_node().get_content_box(box);

		let arrowHeight = Math.floor(this.get_theme_node().get_padding(St.Side.BOTTOM) / 3);
		let arrowWidth = arrowHeight * 2;

		// Now allocate each arrow underneath its item
		let childBox = new Clutter.ActorBox();
		for (let i = 0; i < this._items.length; i++) {
			let itemBox = this._items[i].allocation;
			childBox.x1 = contentBox.x1 + Math.floor(itemBox.x1 + (itemBox.x2 - itemBox.x1 - arrowWidth) / 2);
			childBox.x2 = childBox.x1 + arrowWidth;
			childBox.y1 = contentBox.y1 + itemBox.y2 + arrowHeight;
			childBox.y2 = childBox.y1 + arrowHeight;
			this._arrows[i].allocate(childBox);
		}
	}

	// We override SwitcherList's _onItemMotion method to delay
	// activation when the thumbnail list is open
	_onItemMotion(item) {
		if (item === this._items[this._highlighted] ||
			item === this._items[this._delayedHighlighted])
			return Clutter.EVENT_PROPAGATE;

		const index = this._items.indexOf(item);

		if (this._mouseTimeOutId !== 0) {
			GLib.source_remove(this._mouseTimeOutId);
			this._delayedHighlighted = -1;
			this._mouseTimeOutId = 0;
		}

		if (this._altTabPopup.thumbnailsVisible) {
			this._delayedHighlighted = index;
			this._mouseTimeOutId = GLib.timeout_add(
				GLib.PRIORITY_DEFAULT,
				APP_ICON_HOVER_TIMEOUT,
				() => {
					this._enterItem(index);
					this._delayedHighlighted = -1;
					this._mouseTimeOutId = 0;
					return GLib.SOURCE_REMOVE;
				});
			GLib.Source.set_name_by_id(this._mouseTimeOutId, '[gnome-shell] this._enterItem');
		} else {
			this._itemEntered(index);
		}

		return Clutter.EVENT_PROPAGATE;
	}

	_enterItem(index) {
		let [x, y] = global.get_pointer();
		let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
		if (this._items[index].contains(pickedActor))
			this._itemEntered(index);
	}

	// We override SwitcherList's highlight() method to also deal with
	// the AppSwitcher->ThumbnailSwitcher arrows. Apps with only 1 window
	// will hide their arrows by default, but show them when their
	// thumbnails are visible (ie, when the app icon is supposed to be
	// in justOutline mode). Apps with multiple windows will normally
	// show a dim arrow, but show a bright arrow when they are
	// highlighted.
	highlight(n, justOutline) {
		if (this.icons[this._highlighted]) {
			if (this.icons[this._highlighted].cachedWindows.length === 1)
				this._arrows[this._highlighted].hide();
			else
				this._arrows[this._highlighted].remove_style_pseudo_class('highlighted');
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

		if (this._highlighted !== -1) {
			if (justOutline && this.icons[this._highlighted].cachedWindows.length === 1)
				this._arrows[this._highlighted].show();
			else
				this._arrows[this._highlighted].add_style_pseudo_class('highlighted');
		}
	}

	_addIcon(appIcon) {
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

		appIcon.app.connectObject('notify::state', app => {
			if (app.state !== Shell.AppState.RUNNING)
				this._removeIcon(app);
		}, this);

		let arrow = new St.DrawingArea({style_class: 'switcher-arrow'});
		arrow.connect('repaint', () => SwitcherPopup.drawArrow(arrow, St.Side.BOTTOM));
		this.add_child(arrow);
		this._arrows.push(arrow);

		if (appIcon.cachedWindows.length === 1)
			arrow.hide();
		else
			item.add_accessible_state(Atk.StateType.EXPANDABLE);
	}

	_removeIcon(app) {
		let index = this.icons.findIndex(icon => {
			return icon.app === app;
		});
		if (index === -1)
			return;

		this._arrows[index].destroy();
		this._arrows.splice(index, 1);

		this.icons.splice(index, 1);
		this.removeItem(index);
	}
});
