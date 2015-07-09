import * as utils from 'utils';
// TODO: Ref marked

// Shim & native-safe ownerDocument lookup
var owner = (document._currentScript || document.currentScript).ownerDocument;

class JupyterDisplayArea extends HTMLElement {
    /**
    * When element is created, browser calls this.
    */
    createdCallback() {
        this.clear_queued = false;
        this.outputs = [];
        this.append_map = {
            "text/plain": this.append_text.bind(this),
            "text/html": this.append_html.bind(this),
            "text/markdown": this.append_markdown.bind(this),
            "image/svg+xml": this.append_svg.bind(this),
            "image/png": this.append_png.bind(this),
            "image/jpeg": this.append_jpeg.bind(this),
            "text/latex": this.append_latex.bind(this),
            "application/javascript": this.append_javascript.bind(this),
            "application/pdf": this.append_pdf.bind(this)
        };

        let template = owner.querySelector("#tmpl-jupyter-display-area");

        this.shadow = this.createShadowRoot();
        this.shadow.appendChild(template);
        this.outputs = this.root.getElementById("outputs");
    }

    /**
    * Deserialize
    */
    fromJSON(outputs, metadata) {
        var len = outputs.length;
        metadata = metadata || {};

        for (var i=0; i<len; i++) {
            this.append_output(outputs[i]);
        }
    }

    /**
    * Serialize
    */
    toJSON() {
        return this.outputs;
    }

    /**
     * Handle a message from IPython.
     */
    handle(msg) {
        switch (msg.header.msg_type) {
            case 'clear_output':
                this.handle_clear_output(msg);
                break;
            case 'stream', 'display_data', 'execute_result', 'error':
                this.handle_display(msg);
                break;
        }
    }

    /**
     * Handle a clear output message from IPython.
     */
    handle_clear_output(msg) {
        // msg spec v4 had stdout, stderr, display keys
        // v4.1 replaced these with just wait
        // The default behavior is the same (stdout=stderr=display=True, wait=False),
        // so v4 messages will still be properly handled,
        // except for the rarely used clearing less than all output.
        this.clear_output(msg.content.wait || false);
    }

    /**
     * Handle a display message from IPython.
     */
    handle_display(msg) {
        var json = {};
        var msg_type = json.output_type = msg.header.msg_type;
        var content = msg.content;
        if (msg_type === "stream") {
            json.text = content.text;
            json.name = content.name;
        } else if (msg_type === "display_data") {
            json.data = content.data;
            json.metadata = content.metadata;
        } else if (msg_type === "execute_result") {
            json.data = content.data;
            json.metadata = content.metadata;
            json.execution_count = content.execution_count;
        } else if (msg_type === "error") {
            json.ename = content.ename;
            json.evalue = content.evalue;
            json.traceback = content.traceback;
        } else {
            console.log("unhandled output message", msg);
            return;
        }
        this.append_output(json);
    }

    append_output(json) {

        // Clear the output if clear is queued.
        if (this.clear_queued) {
            this.clear_output(false);
        }

        var record_output = true;
        switch(json.output_type) {
            case 'execute_result':
                json = this.validate_mimebundle(json);
                this.append_execute_result(json);
                break;
            case 'stream':
                // append_stream might have merged the output with earlier stream output
                record_output = this.append_stream(json);
                break;
            case 'error':
                this.append_error(json);
                break;
            case 'display_data':
                // append handled below
                json = this.validate_mimebundle(json);
                this.append_display_data(json);
                break;
            default:
                console.log("unrecognized output type: " + json.output_type);
                this.append_unrecognized(json);
        }

        if (record_output) {
            this.outputs.push(json);
        }
    }

    /**
    * Remove all elements from the display area.
    */
    clear_output(wait, ignore_que) {
        if (wait) {

            // If a clear is queued, clear before adding another to the queue.
            if (this.clear_queued) {
                this.clear_output(false);
            }

            this.clear_queued = true;
        } else {

            // Fix the output div's height if the clear_output is waiting for
            // new output (it is being used in an animation).
            if (!ignore_que && this.clear_queued) {
                this.clear_queued = false;
            }

            // Clear all
            // Remove load event handlers from img tags because we don't want
            // them to fire if the image is never added to the page.
            let o = this.outputs;
            while(o.firstChild) { o.removeChild(o.firstChild); }

            // Notify others of changes.
            // this.trigger('changed');

            this.outputs = [];
            return;
        }
    }

    validate_mimebundle(bundle) {
        // scrub invalid outputs
        if (typeof bundle.data !== 'object') {
            console.warn("mimebundle missing data", bundle);
            bundle.data = {};
        }
        if (typeof bundle.metadata !== 'object') {
            console.warn("mimebundle missing metadata", bundle);
            bundle.metadata = {};
        }
        var data = bundle.data;
        OutputArea.output_types.forEach(function(key) {
            if (key !== 'application/json' &&
                data[key] !== undefined &&
                typeof data[key] !== 'string'
            ) {
                console.log("Invalid type for " + key, data[key]);
                delete data[key];
            }
        });
        return bundle;
    }

    append_execute_result(json) {
        var n = json.execution_count || ' ';
        var toinsert = document.createElement('div');
        this.append_mime_type(json, toinsert);
        this._safe_append(toinsert);
        // If we just output latex, typeset it.
        if ((json.data['text/latex'] !== undefined) ||
            (json.data['text/html'] !== undefined) ||
            (json.data['text/markdown'] !== undefined)) {
            this.typeset();
        }
    }

    append_error(json) {
        var tb = json.traceback;
        if (tb !== undefined && tb.length > 0) {
            var s = '';
            var len = tb.length;
            for (var i=0; i<len; i++) {
                s = s + tb[i] + '\n';
            }
            s = s + '\n';
            var toinsert = document.createElement('div');
            var append_text = this.append_map['text/plain'];
            if (append_text) {
                var appened = append_text.apply(this, [s, {}, toinsert]);
                appended.className += ' output_error';
            }
            this._safe_append(toinsert);
        }
    }

    append_streamn(json) {
        var text = json.text;
        if (typeof text !== 'string') {
            console.error("Stream output is invalid (missing text)", json);
            return false;
        }
        var subclass = "output_"+json.name;

        if (!text.replace("\r", "")) {
            // text is nothing (empty string, \r, etc.)
            // so don't append any elements, which might add undesirable space
            // return true to indicate the output should be recorded.
            return true;
        }

        // If we got here, attach a new div
        var toinsert = document.createElement('div');
        var append_text = this.append_map['text/plain'];
        if (append_text) {
            var appended = append_text.apply(this, [text, {}, toinsert]);
            appended.className += "output_stream " + subclass;
        }
        this._safe_append(toinsert);
        return true;
    }

    append_unrecognized(json) {
        var toinsert = document.createElement('div');
        var subarea =  document.createElement('div');
        subarea.className = 'output_subarea output_unrecognized';
        toinsert.append(subarea);

        var anchor = document.createElement('a');
        anchor.setAttribute("href", "#");
        anchor.textContent = "Unrecognized output: " + json.output_type;

        this._safe_append(toinsert);
    }

    append_display_data(json, handle_inserted) {
        var toinsert = document.createElement('div');
        if (this.append_mime_type(json, toinsert, handle_inserted)) {
            this._safe_append(toinsert);
            // If we just output latex, typeset it.
            if ((json.data['text/latex'] !== undefined) ||
                (json.data['text/html'] !== undefined) ||
                (json.data['text/markdown'] !== undefined)) {
                this.typeset();
            }
        }
    }

    append_mime_type(json, element, handle_inserted) {
        var display_order = [
            'application/javascript',
            'text/html',
            'text/markdown',
            'text/latex',
            'image/svg+xml',
            'image/png',
            'image/jpeg',
            'application/pdf',
            'text/plain'
        ];

        for (var i=0; i < display_order.length; i++) {
            var type = display_order[i];
            var append = append_map[type];
            if ((json.data[type] !== undefined) && append) {
                var value = json.data[type];
                var md = json.metadata || {};
                var toinsert = append.apply(this, [value, md, element, handle_inserted]);
                // Since only the png and jpeg mime types call the inserted
                // callback, if the mime type is something other we must call the
                // inserted callback only when the element is actually inserted
                // into the DOM.  Use a timeout of 0 to do this.
                if (['image/png', 'image/jpeg'].indexOf(type) < 0 && handle_inserted !== undefined) {
                    setTimeout(handle_inserted, 0);
                }
                toinsert.className += ' output_result';
                return toinsert;
            }
        }
        return null;
    }

    _safe_append(toinsert) {
        /**
         * safely append an item to the document
         * this is an object created by user code,
         * and may have errors, which should not be raised
         * under any circumstances.
         */
        try {
            this.appendChild(toinsert);
        } catch(err) {
            console.log(err);
            // Create an actual output_area and output_subarea, which creates
            // the prompt area and the proper indentation.
            var toinsert = document.createElement('div');

            var subarea = document.createElement('div');
            subarea.className = ' output_subarea';

            toinsert.appendChild(subarea);
            this._append_javascript_error(err, subarea);
            this.appendChild(toinsert);
        }
    }

    create_output_subarea(md, classes, mime) {
        var subarea = document.createElement('div');
        subarea.className = 'output_subarea ' + classes.join(' ');
        return subarea;
        // TODO: Implement isolation.
        // if (_get_metadata_key(md, 'isolated', mime)) {
        //     // Create an iframe to isolate the subarea from the rest of the
        //     // document
        //     var iframe = $('<iframe/>').addClass('box-flex1');
        //     iframe.css({'height':1, 'width':'100%', 'display':'block'});
        //     iframe.attr('frameborder', 0);
        //     iframe.attr('scrolling', 'auto');
        //
        //     // Once the iframe is loaded, the subarea is dynamically inserted
        //     iframe.on('load', function() {
        //         // Workaround needed by Firefox, to properly render svg inside
        //         // iframes, see http://stackoverflow.com/questions/10177190/
        //         // svg-dynamically-added-to-iframe-does-not-render-correctly
        //         this.contentDocument.open();
        //
        //         // Insert the subarea into the iframe
        //         // We must directly write the html. When using Jquery's append
        //         // method, javascript is evaluated in the parent document and
        //         // not in the iframe document.  At this point, subarea doesn't
        //         // contain any user content.
        //         this.contentDocument.write(subarea.html());
        //
        //         this.contentDocument.close();
        //
        //         var body = this.contentDocument.body;
        //         // Adjust the iframe height automatically
        //         iframe.height(body.scrollHeight + 'px');
        //     });
        //
        //     // Elements should be appended to the inner subarea and not to the
        //     // iframe
        //     iframe.append = function(that) {
        //         subarea.append(that);
        //     };
        //
        //     return iframe;
        // } else {
        //     return subarea;
        // }
    }

    append_html(html, md, element) {
        var type = 'text/html';
        var toinsert = this.create_output_subarea(md, "output_html rendered_html", type);
        toinsert.appendChild(html);
        element.appendChild(toinsert);
        return toinsert;
    }

    append_markdown(markdown, md, element) {
        var type = 'text/markdown';
        var toinsert = this.create_output_subarea(md, "output_markdown", type);
        toinsert.innerHTML = marked(markdown); // TODO: Math formatting
        element.appendChild(toinsert);
        return toinsert;
    }

    /**
     * We just eval the JS code, element appears in the local scope.
     */
    append_javascript(js, md, element) {
        var type = 'application/javascript';
        var toinsert = this.create_output_subarea(md, "output_javascript", type);
        element.appendChild(toinsert);

        // Fix for ipython/issues/5293, make sure `element` is the area which
        // output can be inserted into at the time of JS execution.
        element = toinsert;
        try {
            eval(js);
        } catch(err) {
            console.log(err);
            this._append_javascript_error(err, toinsert);
        }
        return toinsert;
    }

    /**
     * display a message when a javascript error occurs in display output
     */
    _append_javascript_error(err, element) {
        var msg = "Javascript error adding output!";
        if ( element === undefined ) return;

        var line = document.createElement('div');
        line.textContent = msg;
        line.className = 'js-error';

        element.appendChild(line);

        line = document.createElement('div');
        line.textContent = err.toString();
        line.className = 'js-error';

        element.appendChild(line);

        line = document.createElement('div');
        line.textContent = 'See your browser Javascript console for more details.';
        line.className = 'js-error';

        element.appendChild(line);
        return element;
    }

    append_text(data, md, element) {
        var type = 'text/plain';
        var toinsert = this.create_output_subarea(md, "output_text", type);
        // escape ANSI & HTML specials in plaintext:
        data = utils.fixConsole(data);
        data = utils.fixCarriageReturn(data);
        data = utils.autoLinkUrls(data);
        // The only user content injected with this HTML call is
        // escaped by the fixConsole() method.
        toinsert.innderHTML = data;
        element.append(toinsert);
        return toinsert;
    }

    append_svg(svg_html, md, element) {
        var type = 'image/svg+xml';
        var toinsert = this.create_output_subarea(md, "output_svg", type);

        // Get the svg element from within the HTML.
        var svg = document.createElement('div');
        svg.innerHTML = svg_html;
        svg = svg.firstChild;

        var svg_area = document.createElement('div');
        var width = svg.getAttribute('width');
        var height = svg.getAttribute('height');

        svg.style.width = '100%';
        svg.style.height = '100%';
        svg_area.style.width = width;
        svg_area.style.height = height;

        svg_area.appendChild(svg);
        toinsert.appendChild(svg_area);
        element.appendChild(toinsert);

        return toinsert;
    }

    // TODO: wat
    // /**
    //  * set width and height of an img element from metadata
    //  */
    // set_width_height(img, md, mime) {
    //     var height = _get_metadata_key(md, 'height', mime);
    //     if (height !== undefined) img.attr('height', height);
    //     var width = _get_metadata_key(md, 'width', mime);
    //     if (width !== undefined) img.attr('width', width);
    //     if (_get_metadata_key(md, 'unconfined', mime)) {
    //         img.addClass('unconfined');
    //     }
    // }

    append_png(png, md, element, handle_inserted) {
        var type = 'image/png';
        var toinsert = this.create_output_subarea(md, "output_png", type);
        var img = document.createElement("img");
        // TODO: call handle inserted, or remove it.
        // if (handle_inserted !== undefined) {
        //     img.on('load', function(){
        //         handle_inserted(img);
        //     });
        // }
        img[0].setAttribute('src', 'data:image/png;base64,'+ png);
        // set_width_height(img, md, 'image/png');
        toinsert.appendChild(img);
        element.appendChild(toinsert);
        return toinsert;
    }

    append_jpeg(jpeg, md, element, handle_inserted) {
        var type = 'image/jpeg';
        var toinsert = this.create_output_subarea(md, "output_jpeg", type);
        var img = document.createElement("img");
        // TODO: call handle inserted, or remove it.
        // if (handle_inserted !== undefined) {
        //     img.on('load', function(){
        //         handle_inserted(img);
        //     });
        // }
        img[0].setAttribute('src', 'data:image/jpeg;base64,'+ jpeg);
        // set_width_height(img, md, 'image/jpeg');
        toinsert.appendChild(img);
        element.appendChild(toinsert);
        return toinsert;
    }

    var append_pdf = function (pdf, md, element) {
        var type = 'application/pdf';
        var toinsert = this.create_output_subarea(md, "output_pdf", type);

        var a = document.createElement('a');
        a.setAttribute('href', 'data:application/pdf;base64,'+pdf);
        a.setAttribute('target', '_blank');
        a.textContent = 'View PDF';
        toinsert.appendChild(a);
        element.appendChild(toinsert);
        return toinsert;
     }

     /**
      * This method cannot do the typesetting because the latex first has to
      * be on the page.
      */
     append_latex(latex, md, element) {
        var type = 'text/latex';
        var toinsert = this.create_output_subarea(md, "output_latex", type);
        toinsert.appendChild(latex);
        element.appendChild(toinsert);
        return toinsert;
    }

    // typeset with KATEX
    typeset() {
        // TODO use KATEX
    }
}

// Register jupyter-display-area with the document
document.registerElement('jupyter-display-area', JupyterDisplayArea);
