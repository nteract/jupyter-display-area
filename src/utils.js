
//Fix raw text to parse correctly in crazy XML
export function xmlencode(string) {
    return string.replace(/\&/g,'&'+'amp;')
        .replace(/</g,'&'+'lt;')
        .replace(/>/g,'&'+'gt;')
        .replace(/\'/g,'&'+'apos;')
        .replace(/\"/g,'&'+'quot;')
        .replace(/`/g,'&'+'#96;');
}

export function _process_numbers(attrs, numbers) {
    //Map from terminal commands to CSS classes
    var ansi_colormap = {
        "01":"ansibold",

        "30":"ansiblack",
        "31":"ansired",
        "32":"ansigreen",
        "33":"ansiyellow",
        "34":"ansiblue",
        "35":"ansipurple",
        "36":"ansicyan",
        "37":"ansigray",

        "40":"ansibgblack",
        "41":"ansibgred",
        "42":"ansibggreen",
        "43":"ansibgyellow",
        "44":"ansibgblue",
        "45":"ansibgpurple",
        "46":"ansibgcyan",
        "47":"ansibggray"
    };

    // process ansi escapes
    var n = numbers.shift();
    if (ansi_colormap[n]) {
        if ( ! attrs["class"] ) {
            attrs["class"] = ansi_colormap[n];
        } else {
            attrs["class"] += " " + ansi_colormap[n];
        }
    } else if (n == "38" || n == "48") {
        // VT100 256 color or 24 bit RGB
        if (numbers.length < 2) {
            console.log("Not enough fields for VT100 color", numbers);
            return;
        }

        var index_or_rgb = numbers.shift();
        var r,g,b;
        if (index_or_rgb == "5") {
            // 256 color
            var idx = parseInt(numbers.shift(), 10);
            if (idx < 16) {
                // indexed ANSI
                // ignore bright / non-bright distinction
                idx = idx % 8;
                var ansiclass = ansi_colormap[n[0] + (idx % 8).toString()];
                if ( ! attrs["class"] ) {
                    attrs["class"] = ansiclass;
                } else {
                    attrs["class"] += " " + ansiclass;
                }
                return;
            } else if (idx < 232) {
                // 216 color 6x6x6 RGB
                idx = idx - 16;
                b = idx % 6;
                g = Math.floor(idx / 6) % 6;
                r = Math.floor(idx / 36) % 6;
                // convert to rgb
                r = (r * 51);
                g = (g * 51);
                b = (b * 51);
            } else {
                // grayscale
                idx = idx - 231;
                // it's 1-24 and should *not* include black or white,
                // so a 26 point scale
                r = g = b = Math.floor(idx * 256 / 26);
            }
        } else if (index_or_rgb == "2") {
            // Simple 24 bit RGB
            if (numbers.length > 3) {
                console.log("Not enough fields for RGB", numbers);
                return;
            }
            r = numbers.shift();
            g = numbers.shift();
            b = numbers.shift();
        } else {
            console.log("unrecognized control", numbers);
            return;
        }
        if (r !== undefined) {
            // apply the rgb color
            var line;
            if (n == "38") {
                line = "color: ";
            } else {
                line = "background-color: ";
            }
            line = line + "rgb(" + r + "," + g + "," + b + ");";
            if ( !attrs.style ) {
                attrs.style = line;
            } else {
                attrs.style += " " + line;
            }
        }
    }
}

export function ansispan(str) {
    // ansispan export function adapted from github.com/mmalecki/ansispan (MIT License)
    // regular ansi escapes (using the table above)
    var is_open = false;
    return str.replace(/\033\[(0?[01]|22|39)?([;\d]+)?m/g, function(match, prefix, pattern) {
        if (!pattern) {
            // [(01|22|39|)m close spans
            if (is_open) {
                is_open = false;
                return "</span>";
            } else {
                return "";
            }
        } else {
            is_open = true;

            // consume sequence of color escapes
            var numbers = pattern.match(/\d+/g);
            var attrs = {};
            while (numbers.length > 0) {
                _process_numbers(attrs, numbers);
            }

            var span = "<span ";
            Object.keys(attrs).map(function (attr) {
                span = span + " " + attr + '="' + attrs[attr] + '"';
            });
            return span + ">";
        }
    });
}
// Transform ANSI color escape codes into HTML <span> tags with css
// classes listed in the above ansi_colormap object. The actual color used
// are set in the css file.
export function fixConsole(txt) {
    txt = xmlencode(txt);

    // Strip all ANSI codes that are not color related.  Matches
    // all ANSI codes that do not end with "m".
    var ignored_re = /(?=(\033\[[\d;=]*[a-ln-zA-Z]{1}))\1(?!m)/g;
    txt = txt.replace(ignored_re, "");

    // color ansi codes
    txt = ansispan(txt);
    return txt;
}

// Remove chunks that should be overridden by the effect of
// carriage return characters
export function fixCarriageReturn(txt) {
    var tmp = txt;
    do {
        txt = tmp;
        tmp = txt.replace(/\r+\n/gm, '\n'); // \r followed by \n --> newline
        tmp = tmp.replace(/^.*\r+/gm, '');  // Other \r --> clear line
    } while (tmp.length < txt.length);
    return txt;
}

// Locate any URLs and convert them to a anchor tag
export function autoLinkUrls(txt) {
    return txt.replace(/(^|\s)(https?|ftp)(:[^'">\s]+)/gi,
        "$1<a target=\"_blank\" href=\"$2$3\">$2$3</a>");
}
