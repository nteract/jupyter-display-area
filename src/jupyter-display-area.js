// Shim & native-safe ownerDocument lookup
var owner = (document._currentScript || document.currentScript).ownerDocument;

class JupyterDisplayArea extends HTMLElement {
    /**
    * When element is created, browser calls this.
    */
    createdCallback() {
        this.clear_queued = false;
        this.outputs = [];

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

        // OutputArea.prototype.append_execute_result = function (json) {
        //     var n = json.execution_count || ' ';
        //     // TODO!!!!!!
        //     // var toinsert = this.create_output_area();
        //     var inserted = this.append_mime_type(json, toinsert);
        //     if (inserted) {
        //         inserted.addClass('output_result');
        //     }
        //     this._safe_append(toinsert);
        //     // If we just output latex, typeset it.
        //     if ((json.data['text/latex'] !== undefined) ||
        //         (json.data['text/html'] !== undefined) ||
        //         (json.data['text/markdown'] !== undefined)) {
        //         this.typeset();
        //     }
        // };
            //
            // OutputArea.prototype.append_error = function (json) {
            //     var tb = json.traceback;
            //     if (tb !== undefined && tb.length > 0) {
            //         var s = '';
            //         var len = tb.length;
            //         for (var i=0; i<len; i++) {
            //             s = s + tb[i] + '\n';
            //         }
            //         s = s + '\n';
            //         var toinsert = this.create_output_area();
            //         var append_text = OutputArea.append_map['text/plain'];
            //         if (append_text) {
            //             append_text.apply(this, [s, {}, toinsert]).addClass('output_error');
            //         }
            //         this._safe_append(toinsert);
            //     }
            // };
            //
            //
            // OutputArea.prototype.append_stream = function (json) {
            //     var text = json.text;
            //     if (typeof text !== 'string') {
            //         console.error("Stream output is invalid (missing text)", json);
            //         return false;
            //     }
            //     var subclass = "output_"+json.name;
            //     if (this.outputs.length > 0){
            //         // have at least one output to consider
            //         var last = this.outputs[this.outputs.length-1];
            //         if (last.output_type == 'stream' && json.name == last.name){
            //             // latest output was in the same stream,
            //             // so append directly into its pre tag
            //             // escape ANSI & HTML specials:
            //             last.text = utils.fixCarriageReturn(last.text + json.text);
            //             var pre = this.element.find('div.'+subclass).last().find('pre');
            //             var html = utils.fixConsole(last.text);
            //             html = utils.autoLinkUrls(html);
            //             // The only user content injected with this HTML call is
            //             // escaped by the fixConsole() method.
            //             pre.html(html);
            //             // return false signals that we merged this output with the previous one,
            //             // and the new output shouldn't be recorded.
            //             return false;
            //         }
            //     }
            //
            //     if (!text.replace("\r", "")) {
            //         // text is nothing (empty string, \r, etc.)
            //         // so don't append any elements, which might add undesirable space
            //         // return true to indicate the output should be recorded.
            //         return true;
            //     }
            //
            //     // If we got here, attach a new div
            //     var toinsert = this.create_output_area();
            //     var append_text = OutputArea.append_map['text/plain'];
            //     if (append_text) {
            //         append_text.apply(this, [text, {}, toinsert]).addClass("output_stream " + subclass);
            //     }
            //     this._safe_append(toinsert);
            //     return true;
            // };
            //
            //
            // OutputArea.prototype.append_unrecognized = function (json) {
            //     var that = this;
            //     var toinsert = this.create_output_area();
            //     var subarea = $('<div/>').addClass('output_subarea output_unrecognized');
            //     toinsert.append(subarea);
            //     subarea.append(
            //         $("<a>")
            //             .attr("href", "#")
            //             .text("Unrecognized output: " + json.output_type)
            //             .click(function () {
            //                 that.events.trigger('unrecognized_output.OutputArea', {output: json});
            //             })
            //     );
            //     this._safe_append(toinsert);
            // };
            //
            //
            // OutputArea.prototype.append_display_data = function (json, handle_inserted) {
            //     var toinsert = this.create_output_area();
            //     if (this.append_mime_type(json, toinsert, handle_inserted)) {
            //         this._safe_append(toinsert);
            //         // If we just output latex, typeset it.
            //         if ((json.data['text/latex'] !== undefined) ||
            //             (json.data['text/html'] !== undefined) ||
            //             (json.data['text/markdown'] !== undefined)) {
            //             this.typeset();
            //         }
            //     }
            // };

            // OutputArea.display_order = [
            //     'application/javascript',
            //     'text/html',
            //     'text/markdown',
            //     'text/latex',
            //     'image/svg+xml',
            //     'image/png',
            //     'image/jpeg',
            //     'application/pdf',
            //     'text/plain'
            // ];



                // OutputArea.append_map = {
                //     "text/plain" : append_text,
                //     "text/html" : append_html,
                //     "text/markdown": append_markdown,
                //     "image/svg+xml" : append_svg,
                //     "image/png" : append_png,
                //     "image/jpeg" : append_jpeg,
                //     "text/latex" : append_latex,
                //     "application/javascript" : append_javascript,
                //     "application/pdf" : append_pdf
                // };
        // OutputArea.prototype.append_mime_type = function (json, element, handle_inserted) {
        //     for (var i=0; i < OutputArea.display_order.length; i++) {
        //         var type = OutputArea.display_order[i];
        //         var append = OutputArea.append_map[type];
        //         if ((json.data[type] !== undefined) && append) {
        //             var value = json.data[type];
        //             var md = json.metadata || {};
        //             var toinsert = append.apply(this, [value, md, element, handle_inserted]);
        //             // Since only the png and jpeg mime types call the inserted
        //             // callback, if the mime type is something other we must call the
        //             // inserted callback only when the element is actually inserted
        //             // into the DOM.  Use a timeout of 0 to do this.
        //             if (['image/png', 'image/jpeg'].indexOf(type) < 0 && handle_inserted !== undefined) {
        //                 setTimeout(handle_inserted, 0);
        //             }
        //             return toinsert;
        //         }
        //     }
        //     return null;
        // }


        // OutputArea.prototype._safe_append = function (toinsert) {
        //     /**
        //      * safely append an item to the document
        //      * this is an object created by user code,
        //      * and may have errors, which should not be raised
        //      * under any circumstances.
        //      */
        //     try {
        //         this.element.append(toinsert);
        //     } catch(err) {
        //         console.log(err);
        //         // Create an actual output_area and output_subarea, which creates
        //         // the prompt area and the proper indentation.
        //         // TODO: !!!!
        //         // var toinsert = this.create_output_area();
        //         var subarea = $('<div/>').addClass('output_subarea');
        //         toinsert.append(subarea);
        //         this._append_javascript_error(err, subarea);
        //         this.element.append(toinsert);
        //     }
        //
        //     // Notify others of changes.
        //     this.element.trigger('changed');
        // }
            //
            // var append_html = function (html, md, element) {
            //     var type = 'text/html';
            //     var toinsert = this.create_output_subarea(md, "output_html rendered_html", type);
            //     this.keyboard_manager.register_events(toinsert);
            //     toinsert.append(html);
            //     dblclick_to_reset_size(toinsert.find('img'));
            //     element.append(toinsert);
            //     return toinsert;
            // };
            //
            //
            // var append_markdown = function(markdown, md, element) {
            //     var type = 'text/markdown';
            //     var toinsert = this.create_output_subarea(md, "output_markdown", type);
            //     var text_and_math = mathjaxutils.remove_math(markdown);
            //     var text = text_and_math[0];
            //     var math = text_and_math[1];
            //     marked(text, function (err, html) {
            //         html = mathjaxutils.replace_math(html, math);
            //         toinsert.append(html);
            //     });
            //     dblclick_to_reset_size(toinsert.find('img'));
            //     element.append(toinsert);
            //     return toinsert;
            // };
            //
            //
            // var append_javascript = function (js, md, element) {
            //     /**
            //      * We just eval the JS code, element appears in the local scope.
            //      */
            //     var type = 'application/javascript';
            //     var toinsert = this.create_output_subarea(md, "output_javascript", type);
            //     this.keyboard_manager.register_events(toinsert);
            //     element.append(toinsert);
            //
            //     // Fix for ipython/issues/5293, make sure `element` is the area which
            //     // output can be inserted into at the time of JS execution.
            //     element = toinsert;
            //     try {
            //         eval(js);
            //     } catch(err) {
            //         console.log(err);
            //         this._append_javascript_error(err, toinsert);
            //     }
            //     return toinsert;
            // };
            //
            //
            // var append_text = function (data, md, element) {
            //     var type = 'text/plain';
            //     var toinsert = this.create_output_subarea(md, "output_text", type);
            //     // escape ANSI & HTML specials in plaintext:
            //     data = utils.fixConsole(data);
            //     data = utils.fixCarriageReturn(data);
            //     data = utils.autoLinkUrls(data);
            //     // The only user content injected with this HTML call is
            //     // escaped by the fixConsole() method.
            //     toinsert.append($("<pre/>").html(data));
            //     element.append(toinsert);
            //     return toinsert;
            // };
            //
            //
            // var append_svg = function (svg_html, md, element) {
            //     var type = 'image/svg+xml';
            //     var toinsert = this.create_output_subarea(md, "output_svg", type);
            //
            //     // Get the svg element from within the HTML.
            //     var svg = $('<div />').html(svg_html).find('svg');
            //     var svg_area = $('<div />');
            //     var width = svg.attr('width');
            //     var height = svg.attr('height');
            //     svg
            //         .width('100%')
            //         .height('100%');
            //     svg_area
            //         .width(width)
            //         .height(height);
            //
            //     svg_area.append(svg);
            //     toinsert.append(svg_area);
            //     element.append(toinsert);
            //
            //     return toinsert;
            // };
            //
            //
            // var set_width_height = function (img, md, mime) {
            //     /**
            //      * set width and height of an img element from metadata
            //      */
            //     var height = _get_metadata_key(md, 'height', mime);
            //     if (height !== undefined) img.attr('height', height);
            //     var width = _get_metadata_key(md, 'width', mime);
            //     if (width !== undefined) img.attr('width', width);
            //     if (_get_metadata_key(md, 'unconfined', mime)) {
            //         img.addClass('unconfined');
            //     }
            // };
            //
            // var append_png = function (png, md, element, handle_inserted) {
            //     var type = 'image/png';
            //     var toinsert = this.create_output_subarea(md, "output_png", type);
            //     var img = $("<img/>");
            //     if (handle_inserted !== undefined) {
            //         img.on('load', function(){
            //             handle_inserted(img);
            //         });
            //     }
            //     img[0].src = 'data:image/png;base64,'+ png;
            //     set_width_height(img, md, 'image/png');
            //     dblclick_to_reset_size(img);
            //     toinsert.append(img);
            //     element.append(toinsert);
            //     return toinsert;
            // };
            //
            //
            // var append_jpeg = function (jpeg, md, element, handle_inserted) {
            //     var type = 'image/jpeg';
            //     var toinsert = this.create_output_subarea(md, "output_jpeg", type);
            //     var img = $("<img/>");
            //     if (handle_inserted !== undefined) {
            //         img.on('load', function(){
            //             handle_inserted(img);
            //         });
            //     }
            //     img[0].src = 'data:image/jpeg;base64,'+ jpeg;
            //     set_width_height(img, md, 'image/jpeg');
            //     dblclick_to_reset_size(img);
            //     toinsert.append(img);
            //     element.append(toinsert);
            //     return toinsert;
            // };
            //
            //
            // var append_pdf = function (pdf, md, element) {
            //     var type = 'application/pdf';
            //     var toinsert = this.create_output_subarea(md, "output_pdf", type);
            //     var a = $('<a/>').attr('href', 'data:application/pdf;base64,'+pdf);
            //     a.attr('target', '_blank');
            //     a.text('View PDF');
            //     toinsert.append(a);
            //     element.append(toinsert);
            //     return toinsert;
            //  };
            //
            // var append_latex = function (latex, md, element) {
            //     /**
            //      * This method cannot do the typesetting because the latex first has to
            //      * be on the page.
            //      */
            //     var type = 'text/latex';
            //     var toinsert = this.create_output_subarea(md, "output_latex", type);
            //     toinsert.append(latex);
            //     element.append(toinsert);
            //     return toinsert;
            // };
            //

        //
        // // typeset with MathJax if MathJax is available
        // OutputArea.prototype.typeset = function () {
        //     // TODO use KATEX
        // };

}

// Register jupyter-display-area with the document
document.registerElement('jupyter-display-area', JupyterDisplayArea);
