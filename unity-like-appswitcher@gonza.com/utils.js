
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const St = imports.gi.St;


// We need an icons theme object, this is the only way I managed to get
// pixel buffers that can be used for calculating the backlight color
let themeLoader = null;

// Global icon cache. Used for Unity7 styling.
let iconCacheMap = new Map();
// Max number of items to store
// We don't expect to ever reach this number, but let's put an hard limit to avoid
// even the remote possibility of the cached items to grow indefinitely.
const MAX_CACHED_ITEMS = 1000;
// When the size exceed it, the oldest 'n' ones are deleted
const  BATCH_SIZE_TO_DELETE = 50;
// The icon size used to extract the dominant color
const DOMINANT_COLOR_ICON_SIZE = 64;

// Compute dominant color frim the app icon.
// The color is cached for efficiency.
var DominantColorExtractor = class DashToDock_DominantColorExtractor {

	constructor(app) {
		this._app = app;
	}

	/**
	 * Try to get the pixel buffer for the current icon, if not fail gracefully
	 */
	_getIconPixBuf() {
		let iconTexture = this._app.create_icon_texture(16);

		if (themeLoader === null) {
			let ifaceSettings = new Gio.Settings({ schema: "org.gnome.desktop.interface" });

			themeLoader = new Gtk.IconTheme(),
			themeLoader.set_custom_theme(ifaceSettings.get_string('icon-theme')); // Make sure the correct theme is loaded
		}

		// Unable to load the icon texture, use fallback
		if (iconTexture instanceof St.Icon === false) {
			return null;
		}

		iconTexture = iconTexture.get_gicon();

		// Unable to load the icon texture, use fallback
		if (iconTexture === null) {
			return null;
		}

		if (iconTexture instanceof Gio.FileIcon) {
			// Use GdkPixBuf to load the pixel buffer from the provided file path
			return GdkPixbuf.Pixbuf.new_from_file(iconTexture.get_file().get_path());
		}

		// Get the pixel buffer from the icon theme
		let icon_info = themeLoader.lookup_icon(iconTexture.get_names()[0], DOMINANT_COLOR_ICON_SIZE, 0);
		if (icon_info !== null)
			return icon_info.load_icon();
		else
			return null;
	}

	/**
	 * The backlight color choosing algorithm was mostly ported to javascript from the
	 * Unity7 C++ source of Canonicals:
	 * https://bazaar.launchpad.net/~unity-team/unity/trunk/view/head:/launcher/LauncherIcon.cpp
	 * so it more or less works the same way.
	 */
	_getColorPalette() {
		if (iconCacheMap.get(this._app.get_id())) {
			// We already know the answer
			return iconCacheMap.get(this._app.get_id());
		}

		let pixBuf = this._getIconPixBuf();
		if (pixBuf == null)
			return null;

		let pixels = pixBuf.get_pixels(),
			offset = 0;

		let total  = 0,
			rTotal = 0,
			gTotal = 0,
			bTotal = 0;

		let resample_y = 1,
			resample_x = 1;

		// Resampling of large icons
		// We resample icons larger than twice the desired size, as the resampling
		// to a size s
		// DOMINANT_COLOR_ICON_SIZE < s < 2*DOMINANT_COLOR_ICON_SIZE,
		// most of the case exactly DOMINANT_COLOR_ICON_SIZE as the icon size is tipycally
		// a multiple of it.
		let width = pixBuf.get_width();
		let height = pixBuf.get_height();

		// Resample
		if (height >= 2* DOMINANT_COLOR_ICON_SIZE)
			resample_y = Math.floor(height/DOMINANT_COLOR_ICON_SIZE);

		if (width >= 2* DOMINANT_COLOR_ICON_SIZE)
			resample_x = Math.floor(width/DOMINANT_COLOR_ICON_SIZE);

		if (resample_x !==1 || resample_y !== 1)
			pixels = this._resamplePixels(pixels, resample_x, resample_y);

		// computing the limit outside the for (where it would be repeated at each iteration)
		// for performance reasons
		let limit = pixels.length;
		for (let offset = 0; offset < limit; offset+=4) {
			let r = pixels[offset],
				g = pixels[offset + 1],
				b = pixels[offset + 2],
				a = pixels[offset + 3];

			let saturation = (Math.max(r,g, b) - Math.min(r,g, b));
			let relevance  = 0.1 * 255 * 255 + 0.9 * a * saturation;

			rTotal += r * relevance;
			gTotal += g * relevance;
			bTotal += b * relevance;

			total += relevance;
		}

		total = total * 255;

		let r = rTotal / total,
			g = gTotal / total,
			b = bTotal / total;

		let hsv = ColorUtils.RGBtoHSV(r * 255, g * 255, b * 255);

		if (hsv.s > 0.15)
			hsv.s = 0.65;
		hsv.v = 0.90;

		let rgb = ColorUtils.HSVtoRGB(hsv.h, hsv.s, hsv.v);

		// Cache the result.
		let backgroundColor = {
			lighter:  ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, 0.2),
			original: ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, 0),
			darker:   ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, -0.5)
		};

		if (iconCacheMap.size >= MAX_CACHED_ITEMS) {
			//delete oldest cached values (which are in order of insertions)
			let ctr = 0;
			for (let key of iconCacheMap.keys()) {
				if (++ctr > BATCH_SIZE_TO_DELETE)
					break;
				iconCacheMap.delete(key);
			}
		}

		iconCacheMap.set(this._app.get_id(), backgroundColor);

		return backgroundColor;
	}

	/**
	 * Downsample large icons before scanning for the backlight color to
	 * improve performance.
	 *
	 * @param pixBuf
	 * @param pixels
	 * @param resampleX
	 * @param resampleY
	 *
	 * @return [];
	 */
	_resamplePixels (pixels, resampleX, resampleY) {
		let resampledPixels = [];
		// computing the limit outside the for (where it would be repeated at each iteration)
		// for performance reasons
		let limit = pixels.length / (resampleX * resampleY) / 4;
		for (let i = 0; i < limit; i++) {
			let pixel = i * resampleX * resampleY;

			resampledPixels.push(pixels[pixel * 4]);
			resampledPixels.push(pixels[pixel * 4 + 1]);
			resampledPixels.push(pixels[pixel * 4 + 2]);
			resampledPixels.push(pixels[pixel * 4 + 3]);
		}

		return resampledPixels;
	}
};


/**
 * Color manipulation utilities
  */
var ColorUtils = class DashToDock_ColorUtils {

	// Darken or brigthen color by a fraction dlum
	// Each rgb value is modified by the same fraction.
	// Return "#rrggbb" string
	static ColorLuminance(r, g, b, dlum) {
		let rgbString = '#';

		rgbString += ColorUtils._decimalToHex(Math.round(Math.min(Math.max(r*(1+dlum), 0), 255)), 2);
		rgbString += ColorUtils._decimalToHex(Math.round(Math.min(Math.max(g*(1+dlum), 0), 255)), 2);
		rgbString += ColorUtils._decimalToHex(Math.round(Math.min(Math.max(b*(1+dlum), 0), 255)), 2);

		return rgbString;
	}

	// Convert decimal to an hexadecimal string adding the desired padding
	static _decimalToHex(d, padding) {
		let hex = d.toString(16);
		while (hex.length < padding)
			hex = '0'+ hex;
		return hex;
	}

	static _hexToRgb(h) {
		return {
			r: parseInt(h.substr(1, 2), 16),
			g: parseInt(h.substr(3, 2), 16),
			b: parseInt(h.substr(5, 2), 16)
		}
	}

	// Convert hsv ([0-1, 0-1, 0-1]) to rgb ([0-255, 0-255, 0-255]).
	// Following algorithm in https://en.wikipedia.org/wiki/HSL_and_HSV
	// here with h = [0,1] instead of [0, 360]
	// Accept either (h,s,v) independently or  {h:h, s:s, v:v} object.
	// Return {r:r, g:g, b:b} object.
	static HSVtoRGB(h, s, v) {
		if (arguments.length === 1) {
			s = h.s;
			v = h.v;
			h = h.h;
		}

		let r,g,b;
		let c = v*s;
		let h1 = h*6;
		let x = c*(1 - Math.abs(h1 % 2 - 1));
		let m = v - c;

		if (h1 <=1)
			r = c + m, g = x + m, b = m;
		else if (h1 <=2)
			r = x + m, g = c + m, b = m;
		else if (h1 <=3)
			r = m, g = c + m, b = x + m;
		else if (h1 <=4)
			r = m, g = x + m, b = c + m;
		else if (h1 <=5)
			r = x + m, g = m, b = c + m;
		else
			r = c + m, g = m, b = x + m;

		return {
			r: Math.round(r * 255),
			g: Math.round(g * 255),
			b: Math.round(b * 255)
		};
	}

	// Convert rgb ([0-255, 0-255, 0-255]) to hsv ([0-1, 0-1, 0-1]).
	// Following algorithm in https://en.wikipedia.org/wiki/HSL_and_HSV
	// here with h = [0,1] instead of [0, 360]
	// Accept either (r,g,b) independently or {r:r, g:g, b:b} object.
	// Return {h:h, s:s, v:v} object.
	static RGBtoHSV(r, g, b) {
		if (arguments.length === 1) {
			r = r.r;
			g = r.g;
			b = r.b;
		}

		let h,s,v;

		let M = Math.max(r, g, b);
		let m = Math.min(r, g, b);
		let c = M - m;

		if (c == 0)
			h = 0;
		else if (M == r)
			h = ((g-b)/c) % 6;
		else if (M == g)
			h = (b-r)/c + 2;
		else
			h = (r-g)/c + 4;

		h = h/6;
		v = M/255;
		if (M !== 0)
			s = c/M;
		else
			s = 0;

		return {
			h: h,
			s: s,
			v: v
		};
	}
};
