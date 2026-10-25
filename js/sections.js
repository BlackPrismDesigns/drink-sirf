// Manual sections. Motion is kept quiet so the words stay easy to read while scrolling:
// headings slide up once, blocks fade up a little, and the pieces you can point at answer back.
// Everything runs through Framer Motion and is written as inline styles.

import { animate, motionValue, inView, scroll } from 'https://cdn.jsdelivr.net/npm/framer-motion@11.11.17/dom/+esm';
import Lenis from 'https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.mjs';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const EASE = [0.22, 1, 0.36, 1];
const clamp01 = v => Math.min(1, Math.max(0, v));
const easeOut = t => 1 - Math.pow(1 - t, 3);
// Where t sits between a and b, as 0 → 1.
const span = (t, a, b) => clamp01((t - a) / (b - a));

// ── Smooth, damped scrolling, so a hard flick on a trackpad doesn't fly past everything.
const lenis = reduceMotion ? null : new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, anchors: true });
if (lenis) {
  const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
const scrollToTarget = target => lenis
  ? lenis.scrollTo(target, { duration: 1.4 })
  : (target === 0 ? scrollTo({ top: 0 }) : document.querySelector(target)?.scrollIntoView());

// Tween 0 → 1 and hand each frame to `draw`.
function play(draw, { delay = 0, duration = 0.8 } = {}) {
  const v = motionValue(0);
  v.on('change', draw);
  animate(v, 1, { duration: reduceMotion ? 0 : duration, delay: reduceMotion ? 0 : delay, ease: EASE });
}

// Run once, the first time the element starts to come on screen.
function once(el, fn, amount = 0.1) {
  const stop = inView(el, () => { fn(); stop(); }, { amount });
}

// ── Headings: each line slides up out of its mask, once.
document.querySelectorAll('[data-reveal]').forEach((el, i) => {
  el.innerHTML = `<span>${el.innerHTML}</span>`;
  const line = el.firstElementChild;
  once(el, () => play(v => { line.style.transform = `translateY(${(1 - v) * 105}%)`; },
    { delay: el.previousElementSibling?.hasAttribute('data-reveal') ? 0.12 : 0, duration: 0.9 }), 0.5);
});

// ── Blocks fade up a little; neighbours that arrive together follow closely.
document.querySelectorAll('.rise').forEach(el => once(el, () => {
  const peers = [...el.parentElement.children].filter(c => c.classList.contains('rise'));
  const delay = Math.max(0, peers.indexOf(el)) % 4 * 0.06;
  play(v => {
    el.style.opacity = v;
    el.style.transform = `translateY(${(1 - v) * 14}px)`;
  }, { delay, duration: 0.7 });
}));

// ── Swap: English ↔ Devanagari in one slot. The slot takes the width of whichever word is
// showing; on its own it swaps every few seconds, and pointing at it swaps it too.
document.querySelectorAll('[data-swap]').forEach(el => {
  const [a, b] = el.children;
  const fit = () => {
    const shown = el.classList.contains('is-swapped') ? b : a;
    el.style.width = `${shown.getBoundingClientRect().width}px`;
  };
  const swap = () => { el.classList.toggle('is-swapped'); fit(); };
  document.fonts.ready.then(fit);
  addEventListener('resize', fit);
  el.addEventListener('pointerenter', swap);
  el.addEventListener('click', swap);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); swap(); } });
  if (!reduceMotion) setInterval(swap, Number(el.dataset.every) || 4000);
});

// ── Everything that isn't in the bottle gets struck out, one line at a time, as you scroll.
document.querySelectorAll('[data-strike]').forEach(list => {
  const items = [...list.querySelectorAll('li:not(.nots__yes)')];
  if (reduceMotion) { items.forEach(li => li.style.setProperty('--strike', 1)); return; }
  scroll(p => {
    items.forEach((li, i) => li.style.setProperty('--strike', easeOut(clamp01(p * items.length - i))));
  }, { target: list, offset: ['start 80%', 'end 55%'] });
});

// ── The table scene: the line draws, the bottle drops onto it, the food slides in beside it.
// Pointing at anything gives it a nudge.
document.querySelectorAll('[data-scene]').forEach(scene => {
  const line = scene.querySelector('line');
  const items = [...scene.querySelectorAll('.scene__item')].map((el, i) => {
    const s = { el, kind: el.dataset.item, enter: reduceMotion ? 1 : 0, wobble: motionValue(0), lift: motionValue(0) };
    s.draw = () => {
      const e = easeOut(s.enter);
      const from = s.kind === 'drop'
        ? `translate(0, ${(1 - e) * -60}%)`
        : `translate(${(1 - e) * (20 + i * 10)}vw, 0)`;
      el.style.transform = `${from} translateY(${s.lift.get()}%) rotate(${s.wobble.get()}deg)`;
      el.style.opacity = Math.min(1, e * 2);
    };
    s.wobble.on('change', s.draw);
    s.lift.on('change', s.draw);
    const nudge = () => {
      if (reduceMotion) return;
      s.wobble.set(0);
      animate(s.wobble, 0, { type: 'spring', velocity: i % 2 ? -200 : 200, stiffness: 260, damping: 9 });
      animate(s.lift, [0, -6, 0], { duration: 0.6, ease: EASE });
    };
    el.addEventListener('pointerenter', nudge);
    el.addEventListener('click', nudge);
    s.draw();
    return s;
  });

  if (reduceMotion) { line.setAttribute('stroke-dashoffset', 0); return; }
  scroll(p => {
    line.setAttribute('stroke-dashoffset', 1 - easeOut(span(p, 0.1, 0.6)));
    items[0].enter = span(p, 0.3, 0.75);
    items[1].enter = span(p, 0.4, 0.85);
    items[2].enter = span(p, 0.5, 0.95);
    items.forEach(s => s.draw());
  }, { target: scene, offset: ['start end', 'center center'] });
});

// ── Cards tip slightly towards the pointer.
if (finePointer && !reduceMotion) {
  document.querySelectorAll('[data-tilt]').forEach(card => {
    const rx = motionValue(0), ry = motionValue(0);
    const draw = () => { card.style.transform = `rotateX(${rx.get()}deg) rotateY(${ry.get()}deg)`; };
    rx.on('change', draw);
    ry.on('change', draw);
    const springy = { type: 'spring', stiffness: 220, damping: 20 };
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      animate(rx, -((e.clientY - r.top) / r.height - 0.5) * 8, springy);
      animate(ry, ((e.clientX - r.left) / r.width - 0.5) * 8, springy);
    });
    card.addEventListener('pointerleave', () => { animate(rx, 0, springy); animate(ry, 0, springy); });
  });
}

// ── Pillars: on touch screens a tap does what pointing does.
document.querySelectorAll('.pillar').forEach(p => {
  p.addEventListener('click', () => {
    document.querySelectorAll('.pillar').forEach(o => o !== p && o.classList.remove('is-on'));
    p.classList.toggle('is-on');
  });
});

// ── Brand line: the two lines drift past each other as you scroll through. Both share one
// size, set so the longer line takes 80% of the measure; the drift uses only the room left
// over, so every letter stays on screen and readable the whole way.
document.querySelectorAll('[data-lines]').forEach(group => {
  const lines = [...group.querySelectorAll('.big-line')];
  const [more, less] = lines;
  const room = { left: 0, slack: 0 };
  const fit = () => {
    const margin = parseFloat(getComputedStyle(document.querySelector('.wrap')).paddingLeft);
    const measure = group.clientWidth - margin * 2;
    lines.forEach(l => { l.style.fontSize = '100px'; });
    const widest = Math.max(...lines.map(l => l.getBoundingClientRect().width));
    const size = 100 * measure * 0.8 / widest;
    lines.forEach(l => { l.style.fontSize = `${size}px`; });
    room.left = margin;
    room.slack = measure - widest * size / 100;
  };
  let last = 0.5;
  const place = p => {
    last = p;
    const t = reduceMotion ? 0.5 : clamp01(p);
    more.style.transform = `translateX(${room.left + room.slack * (1 - t)}px)`;
    less.style.transform = `translateX(${room.left + room.slack * t}px)`;
  };
  document.fonts.ready.then(() => { fit(); place(last); });
  addEventListener('resize', () => { fit(); place(last); });
  fit();
  place(0.5);
  if (!reduceMotion) scroll(place, { target: group, offset: ['start end', 'end start'] });
});

// ── Clear space: the guides draw in, then the x squares settle on top.
document.querySelectorAll('[data-draw]').forEach(svg => {
  const lines = [...svg.querySelectorAll('.space__line')];
  const xs = svg.querySelector('.space__x');
  once(svg, () => {
    lines.forEach((l, i) => play(v => { l.style.strokeDashoffset = 1 - v; }, { delay: i * 0.08, duration: 1.1 }));
    play(v => { xs.style.opacity = v; }, { delay: 0.7, duration: 0.6 });
  }, 0.4);
});

// ── Minimum size: drag the wordmark down and see where it stops being legible.
const MIN_PX = 80;
document.querySelectorAll('[data-sizer]').forEach(box => {
  const input = box.querySelector('input');
  const logo = box.querySelector('.sizer__logo');
  const px = box.querySelector('[data-px]');
  const note = box.querySelector('[data-note]');
  const update = () => {
    const w = Number(input.value);
    logo.style.width = `${w}px`;
    px.textContent = `${w} px wide`;
    const small = w < MIN_PX;
    box.classList.toggle('is-small', small);
    note.textContent = small ? `Too small: the minimum is ${MIN_PX} px` : w === MIN_PX ? 'The minimum' : 'Fine on screen';
  };
  input.addEventListener('input', update);
  update();
});

// ── Don'ts: on touch screens, a tap puts the example right (and back).
document.querySelectorAll('.dont').forEach(d => {
  d.addEventListener('click', () => d.classList.toggle('is-fixed'));
  d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); d.classList.toggle('is-fixed'); } });
});

// ── Copy a colour's HEX, with a small note to say so.
const toast = document.querySelector('.toast');
let toastTimer = 0;
function copyHex(hex) {
  navigator.clipboard?.writeText(hex).catch(() => {});
  toast.textContent = `Copied ${hex}`;
  toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-on'), 1600);
}
document.querySelectorAll('.core__swatch[data-copy]').forEach(b => b.addEventListener('click', () => copyHex(b.dataset.copy)));

// ── The palette table: the cards sit where they're placed. With a mouse you can pick them up
// and move them, and a click without a drag copies the colour.
document.querySelectorAll('[data-swatches]').forEach(table => {
  const chips = [...table.querySelectorAll('.chip')];
  const tossed = () => getComputedStyle(chips[0]).position === 'absolute';
  let top = chips.length;

  chips.forEach(chip => {
    const x = motionValue(0), y = motionValue(0);
    const draw = () => { chip.style.transform = `translate(${x.get()}px, ${y.get()}px)`; };
    [x, y].forEach(v => v.on('change', draw));

    let start = null, moved = false;
    chip.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || !tossed()) return;
      start = { px: e.clientX, py: e.clientY, x: x.get(), y: y.get() };
      moved = false;
      chip.style.zIndex = ++top;
      chip.setPointerCapture(e.pointerId);
    });
    chip.addEventListener('pointermove', e => {
      if (!start) return;
      const dx = e.clientX - start.px, dy = e.clientY - start.py;
      if (Math.hypot(dx, dy) > 4) moved = true;
      x.set(start.x + dx);
      y.set(start.y + dy);
    });
    chip.addEventListener('pointerup', () => { start = null; });
    chip.addEventListener('click', e => {
      if (moved) { e.preventDefault(); moved = false; return; }
      copyHex(chip.dataset.copy);
    });
  });
});

// ── Proportion: choosing a colour fills the 30%, with an accent that pairs with it.
const readableOn = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#111111' : '#FFFFFF';
};
document.querySelectorAll('[data-mix]').forEach(mix => {
  const buttons = [...mix.querySelectorAll('[data-main]')];
  const pick = b => {
    buttons.forEach(o => o.setAttribute('aria-checked', String(o === b)));
    mix.style.setProperty('--main', b.dataset.main);
    mix.style.setProperty('--main-fg', readableOn(b.dataset.main));
    mix.style.setProperty('--accent', b.dataset.accent);
    mix.style.setProperty('--accent-fg', readableOn(b.dataset.accent));
  };
  buttons.forEach(b => b.addEventListener('click', () => pick(b)));
  pick(buttons[0]);
});

// ── Type specimens: moving across the big letters runs through the weights, left to right;
// where the family has a width axis, top to bottom runs through the widths as well.
document.querySelectorAll('[data-hover-weight]').forEach(el => {
  const maxW = el.hasAttribute('data-hover-width') ? 800 : 900;
  const w = motionValue(600), d = motionValue(100);
  w.on('change', () => el.style.setProperty('--hw', Math.round(w.get())));
  d.on('change', () => el.style.setProperty('--hd', d.get().toFixed(1)));
  const ease = { type: 'spring', stiffness: 120, damping: 20 };
  el.parentElement.addEventListener('pointermove', e => {
    if (reduceMotion) return;
    const r = el.getBoundingClientRect();
    animate(w, 100 + (maxW - 100) * clamp01((e.clientX - r.left) / r.width), ease);
    if (el.hasAttribute('data-hover-width')) animate(d, 75 + 50 * clamp01((e.clientY - r.top) / r.height), ease);
  });
  el.parentElement.addEventListener('pointerleave', () => { animate(w, 600, ease); animate(d, 100, ease); });
});

// ── Type tester: size and weight sliders and an italic switch over editable text, in either script.
document.querySelectorAll('[data-tester]').forEach(box => {
  const text = box.querySelector('.tester__text');
  const axes = { size: 72, wght: 600 };
  const italic = box.querySelector('[data-italic]');
  const apply = () => {
    text.style.fontSize = `${axes.size}px`;
    text.style.fontWeight = axes.wght;
    text.style.fontStyle = italic.checked ? 'italic' : 'normal';
    for (const k in axes) box.querySelector(`[data-out="${k}"]`).textContent = axes[k];
  };
  italic.addEventListener('change', apply);
  box.querySelectorAll('[data-axis]').forEach(input => input.addEventListener('input', () => {
    axes[input.dataset.axis] = Number(input.value);
    apply();
  }));
  const samples = [...box.querySelectorAll('[data-sample]')];
  samples.forEach(b => b.addEventListener('click', () => {
    samples.forEach(o => o.setAttribute('aria-checked', String(o === b)));
    text.textContent = b.dataset.sample;
    text.lang = b.textContent === 'English' ? 'en' : 'hi';
  }));
  apply();
});

// ── Mark the nav link for the part of the page on screen: the last one whose top has
// passed 40% of the way down the window.
const links = [...document.querySelectorAll('.nav__links a')]
  .map(a => ({ a, target: document.querySelector(a.getAttribute('href')) }))
  .filter(l => l.target);
function markCurrent() {
  const line = innerHeight * 0.4;
  let current = null;
  for (const l of links) if (l.target.getBoundingClientRect().top < line) current = l;
  links.forEach(l => l === current ? l.a.setAttribute('aria-current', 'true') : l.a.removeAttribute('aria-current'));
}
addEventListener('scroll', markCurrent, { passive: true });
markCurrent();

// ── Phone menu: the button opens the black panel of links; picking one, or Escape, closes it.
const nav = document.querySelector('.nav');
const toggle = nav.querySelector('.nav__toggle');
const setMenu = open => {
  nav.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
  if (lenis) open ? lenis.stop() : lenis.start();
};
toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
nav.querySelectorAll('.nav__links a').forEach(a => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

// ── This way up.
document.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => scrollToTarget(0)));
