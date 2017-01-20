# jupyter-display-area

[![Greenkeeper badge](https://badges.greenkeeper.io/nteract/jupyter-display-area.svg)](https://greenkeeper.io/)

Prototype Web Component for Jupyter Display areas

## Installation

```
npm install jupyter-display-area
```

## Including on a page

```html
<script>
  // Include a polyfill if the browser isn't fully supported
  if ('registerElement' in document
    && 'createShadowRoot' in HTMLElement.prototype
    && 'import' in document.createElement('link')
    && 'content' in document.createElement('template')) {
    console.log("Native web components supported!");
  } else {
    document.write('<script src="https:\/\/cdnjs.cloudflare.com/ajax/libs/polymer/0.3.4/platform.js"><\/script>')
  }
</script>

<link rel="import" href="dist/jupyter-display-area.html">

<jupyter-display-area id="play-display"></jupyter-display-area>

<script>
    area = document.querySelector("#play-display");
    area.handle(iopub_message); // Accepts Jupyter Protocol messages
</script>
```

## Build

```bash
npm run build
```

### Browserified build

* `dist/jupyter-display-area.html` - Web Component with fully inlined scripts
* `dist/jupyter-display-area.local.html` - Web Component with separate script
* `dist/jupyter-display-area.js` - Script to pair with jupyter-display-area.local.html

### ES5 build and direct `src`

The transpiled ES5 javascript ends up in `lib/` while the original ES6 sources
are in `src/`. These are intended for use in Electron/Atom, though you may want
to just use the browserified/bundled web component. Your choice!

## Dev

Run `npm run dev` to do automated watch, build, serve, and live-reload.

```bash
npm run dev
```
