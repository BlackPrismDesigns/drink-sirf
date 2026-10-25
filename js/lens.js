// The bottle lens, shared by the banner and the footer: a bottle drawn in WebGL that shows
// whatever type sits behind it magnified inside its outline.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export { THREE };

// The cropped bottle drawing (assets/bottle.svg), in its own units.
export const BOTTLE = { src: 'assets/bottle.svg', w: 114.2, h: 270.3 };

export const loadImage = src => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = rej;
  img.src = src;
});

// Draw the bottle into a canvas with its body filled white. The drawing itself is open between
// its lines, which reads as white on paper but would show through on anything darker. Every
// clear pixel that can't be reached from the canvas edge is inside the outline.
export function paintBottle(paper, art, w, h) {
  paper.width = w;
  paper.height = h;
  const ctx = paper.getContext('2d');
  ctx.drawImage(art, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const outside = new Uint8Array(w * h);
  const stack = [];
  const clear = i => px[i * 4 + 3] < 40;
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (outside[i] || !clear(i)) continue;
    outside[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  for (let i = 0; i < w * h; i++) {
    if (outside[i]) continue;
    // Lay the drawing over white.
    const a = px[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.round(px[i * 4 + c] * a + 255 * (1 - a));
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// A texture from a 2D canvas, drawn 1:1 with the screen (no mipmaps, premultiplied).
export function canvasTexture(paper) {
  const t = new THREE.CanvasTexture(paper);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.premultiplyAlpha = true;
  return t;
}

export const vertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec2 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

// The bottle's own drawing, with the magnified type laid over it inside its outline.
export const fragmentShader = /* glsl */`
  uniform sampler2D uBottle;
  uniform sampler2D uType;
  uniform vec4 uTypeArea;
  uniform vec2 uCenter;
  uniform float uZoom;
  varying vec2 vUv;
  varying vec2 vWorld;
  void main() {
    vec4 bottle = texture2D(uBottle, vUv);
    if (bottle.a < 0.002) discard;

    // Look through the lens: this point shows what sits closer to the bottle's centre.
    vec2 p = uCenter + (vWorld - uCenter) / uZoom;
    vec2 t = (p - uTypeArea.xy) / uTypeArea.zw;
    vec4 type = vec4(0.0);
    if (t.x >= 0.0 && t.x <= 1.0 && t.y >= 0.0 && t.y <= 1.0) {
      type = texture2D(uType, vec2(t.x, 1.0 - t.y)) * bottle.a;
    }
    gl_FragColor = type + bottle * (1.0 - type.a);
  }`;

// One bottle's material. typeArea is the rectangle the type texture covers, in world units.
export function lensMaterial(bottleTex, typeTex, typeArea, zoom) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uBottle: { value: bottleTex },
      uType: { value: typeTex },
      uTypeArea: { value: new THREE.Vector4(typeArea.x, typeArea.y, typeArea.w, typeArea.h) },
      uCenter: { value: new THREE.Vector2() },
      uZoom: { value: zoom },
    },
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    side: THREE.DoubleSide,
  });
}
