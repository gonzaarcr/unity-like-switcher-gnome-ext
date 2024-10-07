import Adw from 'gi://Adw';
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


class PrefsWidget {	

	constructor(schema) {
		this._buildable = new Gtk.Builder();
		this._buildable.add_from_file(
			Gio.File.new_for_uri(import.meta.url).get_parent().get_path() + '/settings.ui'
		);

		let prefsWidget = this._getWidget('prefs_widget');

		this._settings = schema;
		this._bindBooleans();

		this._settings.connect(
			'changed::first-change-window',
			this._firstChangeWindowChanged.bind(this)
		);
		this._firstChangeWindowChanged();
	}

	_getWidget(name) {
		let wname = name.replace(/-/g, '_');
		return this._buildable.get_object(wname);
	}

	_getBooleans() {
		return [
			'first-change-window'
		];
	}

	_bindBoolean(setting) {
		let widget = this._getWidget(setting);
		this._settings.bind(setting, widget, 'active', Gio.SettingsBindFlags.DEFAULT);
	}

	_bindBooleans() {
		this._getBooleans().forEach(this._bindBoolean, this);
	}

	_firstChangeWindowChanged() {
		this._settings.get_boolean('first-change-window');
	}
}

export default class UnityLikeAppSwitcherPreferences extends ExtensionPreferences {
	fillPreferencesWindow (window) {
		window._settings = this.getSettings();
		const widget = new PrefsWidget(window._settings);
		window.add(widget._getWidget('prefs_widget'));
	}
}
