"use strict";

import {RendererBase} from 'transformime/lib/rendererbase';

var Convert = require('ansi-to-html');

export class ConsoleTextRenderer extends RendererBase {
    get mimetype() {
        return 'jupyter/console-text';
    }

    transform(text, doc) {
        // Note: data.ename and data.evalue are available too
        var el = doc.createElement('pre');

        var convert = new Convert({
            escapeXML: true,
            newLine: true
        });
        el.innerHTML = convert.toHtml(text);
        return el;
    }
}

export class StreamRenderer extends ConsoleTextRenderer {
    get mimetype() {
        return 'jupyter/stream';
    }

    transform(data, doc) {
        // Note: data.name (stdout, stderr) should be available too
        return super.transform(data.text, doc);
    }
}

export class TracebackRenderer extends ConsoleTextRenderer {
    get mimetype() {
        return 'jupyter/traceback';
    }

    transform(data, doc) {
        let text, traceback;

        traceback = data.traceback;
        if (traceback !== undefined && traceback.length > 0) {
            text = '';
            var len = traceback.length;
            for (var i=0; i<len; i++) {
                text = text + traceback[i] + '\n';
            }
            text = text + '\n';
        }
        return super.transform(text, doc);
    }
}
