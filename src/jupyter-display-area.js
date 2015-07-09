// Shim & native-safe ownerDocument lookup
var owner = (document._currentScript || document.currentScript).ownerDocument;

class JupyterDisplayArea extends HTMLElement {
    constructor() {
        super.constructor();

        this.clear_queued = false;
        this.outputs = [];
    }

    /**
    * When element is created, browser calls this.
    */
    createdCallback() {
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
                var height = this.offsetHeight;
                this.style.height(height);
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

    /**
     * Handle a display message from IPython.
     */
    display(msg) {
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
        var needs_height_reset = false;
        if (this.clear_queued) {
            this.clear_output(false);
            needs_height_reset = true;
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
                break;
            default:
                console.log("unrecognized output type: " + json.output_type);
                this.append_unrecognized(json);
        }

        // We must release the animation fixed height in a callback since Gecko
        // (FireFox) doesn't render the image immediately as the data is
        // available.
        var that = this;
        var handle_appended = function ($el) {
            /**
             * Only reset the height to automatic if the height is currently
             * fixed (done by wait=True flag on clear_output).
             */
            if (needs_height_reset) {
                that.element.height('');
            }
            that.element.trigger('resize');
        };
        if (json.output_type === 'display_data') {
            this.append_display_data(json, handle_appended);
        } else {
            handle_appended();
        }

        if (record_output) {
            this.outputs.push(json);
        }
    }
}

// Register jupyter-display-area with the document
document.registerElement('jupyter-display-area', JupyterDisplayArea);
