const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Config = imports.misc.config;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const ExtensionUtils = imports.misc.extensionUtils;

const SHELL_VERSION = Config.PACKAGE_VERSION;

const PrefsWidget = GObject.registerClass(
class PrefsWidget extends Gtk.Box {	

	_init(settings, params) {
		super._init(params);

		this._buildable = new Gtk.Builder();
		this._buildable.add_from_file(Me.path + '/settings.ui');

		let prefsWidget = this._getWidget('prefs_widget');
		if (SHELL_VERSION < '40') {
			this.add(prefsWidget);
		} else {
			this.append(prefsWidget);
		}

		this._settings = settings;
		this._bindBooleans();

		this._settings.connect(
			'changed::first-change-window',
			this._firstChangeWindowChanged.bind(this)
		);
		this._firstChangeWindowChanged();
	}

	show_all() {
		if (SHELL_VERSION < '40')
			super.show_all();
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
});

function init() {

}

function buildPrefsWidget() {
	const settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
	const widget = new PrefsWidget(settings);
	widget.show_all();

	return widget;
}
