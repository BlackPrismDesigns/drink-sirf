// Opening banner: the Sirf logo and type, with bottles drifting across it in WebGL.
// Where a bottle passes over the type it works as a lens, showing the type magnified.

import { THREE, BOTTLE as ART, loadImage, paintBottle, canvasTexture, lensMaterial } from './lens.js';
import { animate, motionValue } from 'https://cdn.jsdelivr.net/npm/framer-motion@11.11.17/dom/+esm';

const W = 1920, H = 1080;

// The largest height a bottle is shown at on the banner, in artboard units; the texture is
// drawn at that size.
const BOTTLE = { ...ART, height: 840 };

// Where a bottle passes over the type, it hides it and shows the type magnified,
// like a lens moving across the title.
const ZOOM = 2.4;

// Everything that gets magnified: the logo and the four labels, matching the DOM above.
const TYPE_AREA = { x: 205, y: 380, w: 1490, h: 320 };
const LABELS = [
  { text: 'ब्रांड मैनुअल', x: 226, y: 562.7, size: 46.85, weight: 700 },
  { text: 'ब्रांड मैनुअल', x: 1456.2, y: 547.9, size: 46.85, weight: 700 },
  { text: '2026', x: 664.7, y: 559.8, size: 21.25, weight: 400 },
  { text: '2026', x: 1213.3, y: 559.8, size: 21.25, weight: 400 },
];

// Each bottle sweeps across the board on its own loop: it comes in past one edge of the
// window, curves through `via` (a point on the artboard, near the type, so it passes over it)
// and leaves past another edge, turning through `turn` degrees as it goes.
// Edges are given as [side, position along that side from 0 to 1].
// height is its size in artboard units.
// Each bottle keeps to its own third of the board, and all three share one loop length,
// started a third of a loop apart, so they arrive one at a time and never bunch up.
const LOOP = 9;
const PATHS = [
  { from: ['bottom', 0.16], via: [480, 540],  to: ['top', 0.38],    turn: [-28, 18], height: 840 },
  { from: ['top', 0.6],     via: [990, 540],  to: ['bottom', 0.44], turn: [24, -20], height: 840 },
  { from: ['right', 0.86],  via: [1480, 540], to: ['top', 0.9],     turn: [48, -8],  height: 840 },
].map((p, i) => ({ ...p, duration: LOOP, delay: 0.4 + i * LOOP / 3 }));

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hero = document.getElementById('hero');
const canvas = document.getElementById('bottles');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true });
renderer.setClearColor(0xffffff, 0);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera();

// The camera shows the artboard the same way the stage does (fitted and centred), plus
// whatever extra the banner has around it, with y pointing down like the SVG.
const view = { left: 0, right: W, top: 0, bottom: H, unit: 1 };
function resize() {
  const vw = hero.clientWidth, vh = hero.clientHeight;
  const unit = Math.min(vw / W, vh / H);          // CSS px per artboard unit
  Object.assign(view, {
    unit,
    left: W / 2 - vw / unit / 2, right: W / 2 + vw / unit / 2,
    top: H / 2 - vh / unit / 2, bottom: H / 2 + vh / unit / 2,
  });
  Object.assign(camera, { left: view.left, right: view.right, top: view.top, bottom: view.bottom, near: -10, far: 10 });
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(vw, vh, false);
}
resize();

const [bottleArt, logoSvg] = await Promise.all([
  loadImage(BOTTLE.src),
  fetch('assets/logo.svg').then(r => r.text()),
  ...LABELS.map(l => document.fonts.load(`${l.weight} 40px "Anek Devanagari"`)),
]);

const bottleScale = BOTTLE.height / BOTTLE.h;
const bw = BOTTLE.w * bottleScale, bh = BOTTLE.height;

// Textures are drawn at the exact device-pixel size they're shown at, so hairlines keep
// their weight. The type is drawn ZOOM times larger, since that's how it's seen through the lens.
const bottlePaper = document.createElement('canvas');
const typePaper = document.createElement('canvas');

async function paint() {
  const px = view.unit * renderer.getPixelRatio();

  paintBottle(bottlePaper, bottleArt, Math.ceil(bw * px), Math.ceil(bh * px));

  const k = Math.min(px * ZOOM, Math.min(renderer.capabilities.maxTextureSize, 8192) / TYPE_AREA.w);
  typePaper.width = Math.ceil(TYPE_AREA.w * k);
  typePaper.height = Math.ceil(TYPE_AREA.h * k);
  // Re-crop the logo SVG to the type area at full size, rather than scaling a bitmap.
  const cropped = logoSvg.replace(/viewBox="[^"]*"/,
    `viewBox="${TYPE_AREA.x} ${TYPE_AREA.y} ${TYPE_AREA.w} ${TYPE_AREA.h}" width="${typePaper.width}" height="${typePaper.height}"`);
  const url = URL.createObjectURL(new Blob([cropped], { type: 'image/svg+xml' }));
  const logo = await loadImage(url);
  URL.revokeObjectURL(url);

  const ctx = typePaper.getContext('2d');
  ctx.clearRect(0, 0, typePaper.width, typePaper.height);
  ctx.drawImage(logo, 0, 0);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  for (const l of LABELS) {
    ctx.font = `${l.weight} ${l.size * k}px "Anek Devanagari"`;
    ctx.fillText(l.text, (l.x - TYPE_AREA.x) * k, (l.y - TYPE_AREA.y) * k);
  }
}
await paint();

const bottleTex = canvasTexture(bottlePaper);
const typeTex = canvasTexture(typePaper);

const geometry = new THREE.PlaneGeometry(bw, -bh);   // negative height: upright in the y-down camera
const lerp = (a, b, t) => a + (b - a) * t;

// A point just past a window edge, far enough out that a bottle of this size, at any
// angle, is fully out of sight there.
function edgePoint([side, at], height) {
  const out = Math.hypot(bw, bh) * (height / bh) / 2 + 20;
  switch (side) {
    case 'top':    return [lerp(view.left, view.right, at), view.top - out];
    case 'bottom': return [lerp(view.left, view.right, at), view.bottom + out];
    case 'left':   return [view.left - out, lerp(view.top, view.bottom, at)];
    case 'right':  return [view.right + out, lerp(view.top, view.bottom, at)];
  }
}

// Quadratic curve from a to b that passes through `via` halfway along.
function curve(a, via, b, t) {
  const c = [2 * via[0] - (a[0] + b[0]) / 2, 2 * via[1] - (a[1] + b[1]) / 2];
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
  ];
}

const bottles = PATHS.map(path => {
  const material = lensMaterial(bottleTex, typeTex, TYPE_AREA, ZOOM);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(path.height / bh);
  scene.add(mesh);

  // One Framer Motion value per bottle runs 0 → 1 along its path, on a loop.
  const progress = motionValue(0);
  const place = t => {
    const [x, y] = curve(edgePoint(path.from, path.height), path.via, edgePoint(path.to, path.height), t);
    mesh.position.set(x, y, 0);
    mesh.rotation.z = THREE.MathUtils.degToRad(lerp(path.turn[0], path.turn[1], t));
    material.uniforms.uCenter.value.set(x, y);
  };
  progress.on('change', place);
  place(0);
  return { path, progress, place };
});

// Intro: the logo comes up first, then the type either side of it, then the bottles
// start crossing through, one after another, and keep going.
const EASE = [0.22, 1, 0.36, 1];
// Driven through a motion value and written as inline styles, because Framer Motion would
// otherwise set SVG attributes on the labels, which the stylesheet overrides.
const reveal = (el, delay) => {
  const shown = motionValue(0);
  shown.on('change', v => {
    el.style.opacity = v;
    el.style.transform = `translateY(${(1 - v) * 24}px)`;
  });
  animate(shown, 1, { duration: reduceMotion ? 0 : 1.1, delay, ease: EASE });
};
reveal(hero.querySelector('.logo'), 0.1);
hero.querySelectorAll('.labels .reveal').forEach((el, i) => reveal(el, 0.45 + i * 0.08));

for (const b of bottles) {
  if (reduceMotion) {
    // Still frame: each bottle parked partway across, so the lens still reads.
    b.progress.set([0.5, 0.17, 0.83][bottles.indexOf(b)]);
    continue;
  }
  animate(b.progress, [0, 1], {
    duration: b.path.duration, delay: b.path.delay, ease: 'linear', repeat: Infinity,
  });
}

let repaintTimer = 0;
addEventListener('resize', () => {
  resize();
  bottles.forEach(b => b.place(b.progress.get()));
  clearTimeout(repaintTimer);
  repaintTimer = setTimeout(async () => {
    await paint();
    for (const t of [bottleTex, typeTex]) { t.dispose(); t.needsUpdate = true; }
  }, 200);
});

// Only draw while the banner is on screen; the rest of the manual doesn't need the GPU.
let onScreen = true;
new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }).observe(hero);
renderer.setAnimationLoop(() => { if (onScreen) renderer.render(scene, camera); });
