// The cursor is one of the pack's arrows. It points the way you move, and when you stop it
// turns back to point up: this way up. Over anything you can press, it grows.
// Fine pointers only; touch screens keep their own behaviour.

import { animate, motionValue } from 'https://cdn.jsdelivr.net/npm/framer-motion@11.11.17/dom/+esm';

const fine = matchMedia('(pointer: fine)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = document.querySelector('.cursor');

if (fine && el) {
  const turn = motionValue(0);
  const spin = { type: 'spring', stiffness: 200, damping: 20 };
  let x = 0, y = 0, lastX = 0, lastY = 0, upTimer = 0;

  const draw = () => {
    // The arrow's tip sits on the pointer.
    el.style.transform = `translate(${x - 9}px, ${y}px) rotate(${turn.get()}deg)`;
  };
  turn.on('change', draw);
  el.style.transformOrigin = '50% 0';

  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    document.documentElement.classList.add('has-cursor');
    x = e.clientX; y = e.clientY;
    const dx = x - lastX, dy = y - lastY;
    if (!reduceMotion && Math.hypot(dx, dy) > 4) {
      // Point along the movement, taking the short way round.
      let target = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      const current = turn.get();
      target += Math.round((current - target) / 360) * 360;
      animate(turn, target, spin);
      lastX = x; lastY = y;
    }
    clearTimeout(upTimer);
    upTimer = setTimeout(() => {
      const current = turn.get();
      animate(turn, Math.round(current / 360) * 360, spin);
    }, 160);
    draw();

    const t = e.target;
    el.classList.toggle('is-big', !!t.closest('a, button, [data-swap], .pillar, .scene__item, .roomy, .dont, input, .chip, .tester__text'));
  }, { passive: true });

  document.addEventListener('pointerleave', () => document.documentElement.classList.remove('has-cursor'));
}
