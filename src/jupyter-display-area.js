import {
    Transformime,
    TextTransformer,
    ImageTransformer,
    HTMLTransformer
} from "transformime";

import {
    StreamTransformer,
    TracebackTransformer,
    MarkdownTransformer,
    LaTeXTransformer,
    PDFTransformer
} from "transformime-jupyter-transformers";

(function() {

// Shim & native-safe ownerDocument lookup
var owner = document.currentScript.ownerDocument;

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


        /**
         * Original display order
         *
        OutputArea.display_order = [
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
        */

        // Transformers are in reverse priority order
        // so that new ones can be `push`ed on with higher priority
        var transformers = [
            new TextTransformer(),
            new PDFTransformer(),
            new ImageTransformer('image/jpeg'),
            new ImageTransformer('image/gif'),
            new ImageTransformer('image/png'),
            // SVG would go here, IF I HAD ONE
            new StreamTransformer(),
            new TracebackTransformer(),
            new MarkdownTransformer(),
            new HTMLTransformer()
            // JavaScript would go here, IF I HAD ONE
        ];

        this.transformime = new Transformime(transformers);

        // 'Private'
        this._outputs = [];
        this._clear_queued = false;
    }

    /**
     * Deserialize, filling the output area.
     * @param  {object} outputs - See nbformat
     */
    fromJSON(outputs) {
        // TODO: Update for promises
        outputs.map(this.appendOutput.bind(this));
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
     * @return {Promise}     Happy promise
     */
    handle(msg) {
        if(! msg.header || !msg.header.msg_type) {
            return;
        }

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
                this.clearOutput(msg.content.wait || false);
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
                // Explicit ignore of status changes and input
                return false;
            default:
                console.log('unhandled output message', msg);
                return false;
        }
        return this.appendOutput(json);
    }

    /**
     * Remove all elements from the display area.
     * @param  {boolean} wait - wait until the next display message before clearing.
     */
    clearOutput(wait) {
        if (wait) {

            // If a clear is queued, clear before adding another to the queue.
            if (this._clear_queued) {
                this.clearOutput(false);
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
     * @return {bool}      whether or not output was appended
     */
    appendOutput(json) {
        let bundle, el;
        bundle = {};

        // Clear the output if clear is queued.
        if (this._clear_queued) {
            this.clearOutput(false);
        }

        switch(json.output_type) {
            case 'execute_result':
            case 'display_data':
                bundle = json.data;
                break;
            case 'stream':
                bundle = {'jupyter/stream': json};
                break;
            case 'error':
                bundle = {'jupyter/traceback': json};
                break;
            default:
                console.warn('Unrecognized output type: ' + json.output_type);
                bundle = {'text/plain': 'Unrecognized output type' + JSON.stringify(json)};
        }

        let elementPromise = this.transformime.transformRichest(bundle, this.document);

        elementPromise.then(elementBundle => {
            this.el.appendChild(elementBundle.el);
        });
        
        return elementPromise;
    }

}

// Register jupyter-display-area with the document
owner.registerElement('jupyter-display-area', JupyterDisplayArea);

})();
