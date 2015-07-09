// Shim & native-safe ownerDocument lookup
var owner = (document._currentScript || document.currentScript).ownerDocument;

class JupyterDisplayArea extends HTMLElement {
  createdCallback() {
    let template = owner.querySelector("#tmpl-jupyter-display-area");

    this.shadow = this.createShadowRoot();
    this.shadow.appendChild(template);
    this.outputs = this.shadow.getElementById("outputs");
  }

  /**
   * clear out the entire display area
   */
  clear() {
    let o = this.outputs;
    while(o.firstChild) { o.removeChild(o.firstChild); }
  }

  handle(message) {
    if(! message.header || ! message.header.msg_type){
      return;
    }

    let p = document.createElement("p");
    let text = document.createTextNode(message.header.msg_type);

    p.appendChild(text);

    this.shadow.appendChild(p);

    switch(message.header.msg_type) {
      case "execute_result":
      case "display_data":
        break;
      case "stream":
        break;
      case "error":
        break;
      case "execute_input":
      case "status":
        // We don't do anything with execute_input for the moment
        // status is ignored, handled elsewhere
        break;
      case "comm_open":
      case "comm_msg":
        break;
      default:
        console.log("Noticed a msg_type we don't recognize");
        console.log(message);
    }
  }

}

// Register jupyter-display-area with the document
document.registerElement('jupyter-display-area', JupyterDisplayArea);
