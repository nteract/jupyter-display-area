import {TextRenderer} from './textrenderer';

(function() {

// Shim & native-safe ownerDocument lookup
var owner = (document._currentScript || document.currentScript).ownerDocument;

/**
 * Jupyter display area.
 *
 * Used to dsiplay output from Jupyter kernels.
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
        this.el = this.shadow.getElementById('outputs');

        // Initialize instance variables.
        this.renderers = [new TextRenderer()];
        this.fallback_renderer = new TextRenderer();

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

            // Fix the output div's height if the clear_output is waiting for
            // new output (it is being used in an animation).
            if (this._clear_queued) {
                this._clear_queued = false;
            }

            // Clear all
            // Remove load event handlers from img tags because we don't want
            // them to fire if the image is never added to the page.
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

        // Clear the output if clear is queued.
        if (this._clear_queued) {
            this.clear_output(false);
        }

        var record_output = true;
        switch(json.output_type) {
            case 'execute_result':
                json = this._validate_mimebundle(json);
                this._append_mime_bundle(json);
                break;
            case 'stream':
                // append_stream might have merged the output with earlier stream output
                record_output = this._append_stream(json);
                break;
            case 'error':
                this._append_error(json);
                break;
            case 'display_data':
                // append handled below
                json = this._validate_mimebundle(json);
                this._append_mime_bundle(json.data, json.metadata);
                break;
            default:
                console.warn('Unrecognized output type: ' + json.output_type);
                this._append_unrecognized(json);
        }

        if (record_output) {
            this._outputs.push(json);
        }
    }

    get_renderer(mimetype) {
        for (let renderer of this.renderers) {
            if (mimetype === renderer.mimetype) {
                return renderer;
            }
        }
        return null;
    }

    /**
     * Appends stream data to the output area.
     * @param  {object} json - see nbformat
     */
    _append_stream(json) {
        var text = json.text;
        if (typeof text !== 'string') {
            console.error('Stream output is invalid (missing text)', json);
            return;
        }
        if (!text.replace('\r', '')) {
            return;
        }

        this._append_mimetype(text, 'text/plain');
    }

    _append_error(json) {
        var traceback = json.traceback;
        if (traceback !== undefined && traceback.length > 0) {
            var text = '';
            var len = traceback.length;
            for (var i=0; i<len; i++) {
                text = text + traceback[i] + '\n';
            }
            text = text + '\n';

            this._append_mimetype(text, 'text/plain');
        }
    }

    _append_unrecognized(json) {
        this._append_mimetype('Unrecognized output: ' + json.output_type, 'text/plain');
    }

    _append_mime_bundle(json, metadata) {
        let element;
        for (let renderer of this.renderers) {
            let data = json[renderer.mimetype];
            if (data) {
                element = renderer.render(data, metadata);
            }
        }

        if (!element && this.fallback_renderer) {
            console.warn('Fallback renderer used');
            element = this.fallback_renderer.render(JSON.stringify(json));
        }

        if (element) {
            this.el.appendChild(element);
            return element;
        } else {
            throw new Error('Renderer for mimetypes ' + Object.keys(json).join(', ') + ' not found.');
        }
    }

    _append_mimetype(data, mimetype, metadata) {
        var renderer = this.get_renderer(mimetype);
        if (renderer) {
            let element = renderer.render(data, metadata);
            this.el.appendChild(element);
            return element;
        }

        throw new Error('Renderer for mimetype ' + mimetype + ' not found.');
    }

    /**
     * Validate a mime bundle.
     * @param  {object} bundle
     * @return {object} bundle
     */
    _validate_mimebundle(bundle) {
        if (typeof bundle.data !== 'object') {
            console.warn('Mimebundle missing data', bundle);
            bundle.data = {};
        }

        if (typeof bundle.metadata !== 'object') {
            console.warn('Mimebundle missing metadata', bundle);
            bundle.metadata = {};
        }

        return bundle;
    }
}

// Register jupyter-display-area with the document
document.registerElement('jupyter-display-area', JupyterDisplayArea);

})();
