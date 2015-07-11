# jupyter-display-area

Prototype Web Component for Jupyter Display areas

## Build

```
npm install
```

Resulting web component is in `dist/jupyter-display-area.html`.

## Run the current demo

```
npm run serve
```

## Including on a page

```
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
