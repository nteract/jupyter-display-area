export class RendererBase {
    get mimetype() {
        throw new Error('mimetype not implemented');
    }

    render(data) {
        throw new Error('render not implemented');
    }
}
