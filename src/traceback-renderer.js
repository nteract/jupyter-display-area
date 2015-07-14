"use strict";

import {RendererBase} from 'transformime/lib/rendererbase';

var Convert = require('ansi-to-html');

export class TracebackRenderer extends RendererBase {
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
