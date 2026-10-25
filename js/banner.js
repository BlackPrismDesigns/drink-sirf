// Opening banner: the Sirf logo and type, with bottles drifting across it in WebGL.
// Where a bottle passes over the type it works as a lens, showing the type magnified.
// Wide screens use the 1920 x 1080 artboard from the Illustrator file; tall screens (phones)
// stack the same type vertically on a 1080 x 1920 artboard.

import { THREE, BOTTLE as ART, loadImage, paintBottle, canvasTexture, lensMaterial } from './lens.js';
import { animate, motionValue } from 'https://cdn.jsdelivr.net/npm/framer-motion@11.11.17/dom/+esm';

// The largest height a bottle is shown at, in artboard units; the texture is drawn at that size.
const BOTTLE = { ...ART, height: 840 };

// Where a bottle passes over the type, it hides it and shows the type magnified,
// like a lens moving across the title.
const ZOOM = 2.4;

// Each bottle sweeps across the board on its own loop: it comes in past one edge of the
// window, curves through `via` (a point on the artboard, over the type) and leaves past
// another edge, turning through `turn` degrees as it goes. Edges are [side, 0–1 along it].
// Each bottle keeps to its own third of the board. All three share one loop length and start
// a third of a loop apart, so two or three are on screen at once but never bunch up.
const LOOP = 9;
const PHASES = [0.12, 0.45, 0.78];

const LAYOUTS = {
  // Wide: exactly the Illustrator artboard.
  wide: {
    W: 1920, H: 1080,
    typeArea: { x: 205, y: 380, w: 1490, h: 320 },
    logo: { crop: true },
    labels: [
      { text: 'ब्रांड मैनुअल', x: 226, y: 562.7, size: 46.85, weight: 700 },
      { text: 'ब्रांड मैनुअल', x: 1456.2, y: 547.9, size: 46.85, weight: 700 },
      { text: '2026', x: 664.7, y: 559.8, size: 21.25, weight: 400 },
      { text: '2026', x: 1213.3, y: 559.8, size: 21.25, weight: 400 },
    ],
    paths: [
      { from: ['bottom', 0.16], via: [480, 540],  to: ['top', 0.38],    turn: [-28, 18], height: 840 },
      { from: ['top', 0.6],     via: [990, 540],  to: ['bottom', 0.44], turn: [24, -20], height: 840 },
      { from: ['right', 0.86],  via: [1480, 540], to: ['top', 0.9],     turn: [48, -8],  height: 840 },
    ],
  },
  // Tall: the same pieces stacked, larger, matching the portrait stage in the page.
  tall: {
    W: 1080, H: 1920,
    typeArea: { x: 40, y: 430, w: 1000, h: 1060 },
    logo: { x: 160, y: 689.5, w: 760 },
    labels: [
      { text: 'ब्रांड मैनुअल', x: 540, y: 520, size: 72, weight: 700, center: true },
      { text: '2026', x: 540, y: 605, size: 34, weight: 400, center: true },
      { text: '2026', x: 540, y: 1325, size: 34, weight: 400, center: true },
      { text: 'ब्रांड मैनुअल', x: 540, y: 1440, size: 72, weight: 700, center: true },
    ],
    paths: [
      { from: ['bottom', 0.2],  via: [250, 960], to: ['top', 0.32],    turn: [-20, 14], height: 760 },
      { from: ['top', 0.55],    via: [560, 960], to: ['bottom', 0.48], turn: [18, -16], height: 760 },
      { from: ['bottom', 0.86], via: [850, 960], to: ['top', 0.78],    turn: [-12, 20], height: 760 },
    ],
  },
};

const tallQuery = matchMedia('(max-aspect-ratio: 4/5)');
let layout = tallQuery.matches ? LAYOUTS.tall : LAYOUTS.wide;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hero = document.getElementById('hero');
const canvas = document.getElementById('bottles');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true });
renderer.setClearColor(0xffffff, 0);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera();

// The camera shows the artboard the same way the stage does (fitted and centred), plus
// whatever extra the banner has around it, with y pointing down like the SVG.
const view = { left: 0, right: 1, top: 0, bottom: 1, unit: 1 };
function resize() {
  const { W, H } = layout;
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
  document.fonts.load('700 40px "Anek Devanagari"'),
  document.fonts.load('400 40px "Anek Devanagari"'),
]);
// The wordmark's outlines, for the tall layout, where the logo sits on its own.
const SIRF = document.getElementById('sirf');
const sirfBox = SIRF.viewBox.baseVal;
const sirfPaths = [...SIRF.querySelectorAll('path')].map(p => new Path2D(p.getAttribute('d')));

const bottleScale = BOTTLE.height / BOTTLE.h;
const bw = BOTTLE.w * bottleScale, bh = BOTTLE.height;

// Textures are drawn at the exact device-pixel size they're shown at, so hairlines keep
// their weight. The type is drawn ZOOM times larger, since that's how it's seen through the lens.
const bottlePaper = document.createElement('canvas');
const typePaper = document.createElement('canvas');

async function paint() {
  const px = view.unit * renderer.getPixelRatio();
  const area = layout.typeArea;

  paintBottle(bottlePaper, bottleArt, Math.ceil(bw * px), Math.ceil(bh * px));

  const k = Math.min(px * ZOOM, Math.min(renderer.capabilities.maxTextureSize, 8192) / Math.max(area.w, area.h));
  typePaper.width = Math.ceil(area.w * k);
  typePaper.height = Math.ceil(area.h * k);
  const ctx = typePaper.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, typePaper.width, typePaper.height);

  if (layout.logo.crop) {
    // Re-crop the logo SVG to the type area at full size, rather than scaling a bitmap.
    const cropped = logoSvg.replace(/viewBox="[^"]*"/,
      `viewBox="${area.x} ${area.y} ${area.w} ${area.h}" width="${typePaper.width}" height="${typePaper.height}"`);
    const url = URL.createObjectURL(new Blob([cropped], { type: 'image/svg+xml' }));
    ctx.drawImage(await loadImage(url), 0, 0);
    URL.revokeObjectURL(url);
  } else {
    const { x, y, w } = layout.logo;
    const s = w / sirfBox.width * k;
    ctx.setTransform(s, 0, 0, s, (x - area.x) * k - sirfBox.x * s, (y - area.y) * k - sirfBox.y * s);
    ctx.fillStyle = '#000';
    sirfPaths.forEach(p => ctx.fill(p));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  for (const l of layout.labels) {
    ctx.font = `${l.weight} ${l.size * k}px "Anek Devanagari"`;
    ctx.textAlign = l.center ? 'center' : 'left';
    ctx.fillText(l.text, (l.x - area.x) * k, (l.y - area.y) * k);
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

const bottles = PHASES.map((phase, i) => {
  const material = lensMaterial(bottleTex, typeTex, layout.typeArea, ZOOM);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // One Framer Motion value per bottle runs 0 → 1 along its path, on a loop.
  const progress = motionValue(phase);
  const place = t => {
    const path = layout.paths[i];
    mesh.scale.setScalar(path.height / bh);
    const [x, y] = curve(edgePoint(path.from, path.height), path.via, edgePoint(path.to, path.height), t);
    mesh.position.set(x, y, 0);
    mesh.rotation.z = THREE.MathUtils.degToRad(lerp(path.turn[0], path.turn[1], t));
    material.uniforms.uCenter.value.set(x, y);
  };
  progress.on('change', place);
  place(phase);
  return { material, progress, place, phase };
});

// Intro: the logo comes up first, then the type around it. The bottles are already
// spread along their loops, so two or three cross the type from the first moment.
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
hero.querySelectorAll('.stage').forEach(stage => {
  stage.querySelectorAll('.reveal').forEach((el, i) => reveal(el, el.classList.contains('reveal--logo') ? 0.1 : 0.45 + i * 0.08));
});

for (const b of bottles) {
  if (reduceMotion) continue;   // still frame: each bottle parked at its phase, so the lens still reads
  const loop = animate(b.progress, [0, 1], { duration: LOOP, ease: 'linear', repeat: Infinity });
  loop.time = b.phase * LOOP;
}

// Re-fit everything to the window; switching between wide and tall swaps the layout.
let repaintTimer = 0;
function refit() {
  const next = tallQuery.matches ? LAYOUTS.tall : LAYOUTS.wide;
  const switched = next !== layout;
  layout = next;
  resize();
  if (switched) {
    const a = layout.typeArea;
    bottles.forEach(b => b.material.uniforms.uTypeArea.value.set(a.x, a.y, a.w, a.h));
  }
  bottles.forEach(b => b.place(b.progress.get()));
  clearTimeout(repaintTimer);
  repaintTimer = setTimeout(async () => {
    await paint();
    for (const t of [bottleTex, typeTex]) { t.dispose(); t.needsUpdate = true; }
  }, switched ? 0 : 200);
}
addEventListener('resize', refit);

// Only draw while the banner is on screen; the rest of the manual doesn't need the GPU.
let onScreen = true;
new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }).observe(hero);
renderer.setAnimationLoop(() => { if (onScreen) renderer.render(scene, camera); });
