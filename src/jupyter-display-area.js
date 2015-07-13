import {Transformime} from "transformime";

(function() {

// Shim & native-safe ownerDocument lookup
var owner = (document._currentScript || document.currentScript).ownerDocument;

/**
 * Jupyter display area.
 *
 * Used to display output from Jupyter kernels.
 */
class JupyterDisplayArea extends HTMLElement {

    /**
     * When element is created, browser calls this.
     */
    createdCallback() {
        let template = owner.querySelector('#tmpl-jupyter-display-area');
        let node = owner.importNode(template.content, true);

        this.shadow = this.createShadowRoot();
        this.shadow.appendChild(node);
        this.document = this.shadow.ownerDocument;

        this.el = this.shadow.getElementById('outputs');

        this.transformime = new Transformime();

        // 'Private'
        this._outputs = [];
        this._clear_queued = false;
    }

    /**
     * Deserialize, filling the output area.
     * @param  {object} outputs - See nbformat
     */
    fromJSON(outputs) {
        outputs.map(this.append_output.bind(this));
    }

    /**
     * Serialize the contents of the output area.
     * @return {object} See nbformat.
     */
    toJSON() {
        return this._outputs;
    }

    /**
     * Handle a Jupyter message.
     *
     * Only handles display related messages, including clear output.
     * @param  {object} msg - See Jupyter msgspec.
     */
    handle(msg) {
        var json = {};
        var msg_type = json.output_type = msg.header.msg_type;
        var content = msg.content;
        switch (msg_type) {
            case 'clear_output':
                // msg spec v4 had stdout, stderr, display keys
                // v4.1 replaced these with just wait
                // The default behavior is the same (stdout=stderr=display=True, wait=False),
                // so v4 messages will still be properly handled,
                // except for the rarely used clearing less than all output.
                this.clear_output(msg.content.wait || false);
                return;
            case 'stream':
                json.text = content.text;
                json.name = content.name;
                break;
            case 'display_data':
                json.data = content.data;
                json.metadata = content.metadata;
                break;
            case 'execute_result':
                json.data = content.data;
                json.metadata = content.metadata;
                json.execution_count = content.execution_count;
                break;
            case 'error':
                json.ename = content.ename;
                json.evalue = content.evalue;
                json.traceback = content.traceback;
                break;
            case 'status':
            case 'execute_input':
                // Explicit ignore of status changes
                return;
            default:
                console.log('unhandled output message', msg);
                return;
        }
        this.append_output(json);
    }

    /**
     * Remove all elements from the display area.
     * @param  {boolean} wait - wait until the next display message before clearing.
     */
    clear_output(wait) {
        if (wait) {

            // If a clear is queued, clear before adding another to the queue.
            if (this._clear_queued) {
                this.clear_output(false);
            }

            this._clear_queued = true;
        } else {

            if (this._clear_queued) {
                this._clear_queued = false;
            }

            // Clear all
            let o = this.el;
            while(o.firstChild) { o.removeChild(o.firstChild); }

            this._outputs = [];
            return;
        }
    }

    /**
     * Append output to the output area.
     * @param  {object} json - output json.  See nbformat.
     */
    append_output(json) {
        let bundle, el;
        bundle = {};

        // Clear the output if clear is queued.
        if (this._clear_queued) {
            this.clear_output(false);
        }

        switch(json.output_type) {
            case 'execute_result':
            case 'display_data':
                bundle = json.data;
                break;
            case 'stream':
                bundle = this.createStreamBundle(json);
                break;
            case 'error':
                bundle = this.createErrorBundle(json);
                break;
            default:
                console.warn('Unrecognized output type: ' + json.output_type);
                bundle = {'text/plain': 'Unrecognized output type' + JSON.stringify(json)};
        }

        el = this.transformime.transformRichest(bundle, this.document);
        if (el) {
            this.el.appendChild(el);
        }

    }

    /**
     * Appends stream data to the output area.
     * @param  {object} json - see nbformat
     */
    createStreamBundle(json) {
        var text = json.text;
        if (typeof text !== 'string') {
            console.error('Stream output is invalid (missing text)', json);
            return;
        }
        if (!text.replace('\r', '')) {
            return;
        }

        return {'text/plain': text};
    }

    createErrorBundle(json) {
        var traceback = json.traceback;
        if (traceback !== undefined && traceback.length > 0) {
            var text = '';
            var len = traceback.length;
            for (var i=0; i<len; i++) {
                text = text + traceback[i] + '\n';
            }
            text = text + '\n';

            return {'text/plain': text};
        }
    }

}

// Register jupyter-display-area with the document
document.registerElement('jupyter-display-area', JupyterDisplayArea);

})();
