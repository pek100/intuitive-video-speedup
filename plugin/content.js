(function () {
  'use strict';

  const MIN_SPEED = 0.1;
  const MAX_SPEED = 4.0;
  // Click resets to 1x (no cycling)
  const MIN_VOL = 0;
  const MAX_VOL = 1;
  const DEAD_ZONE = 15;
  const BTN_SIZE = 44;
  const RING_SIZE = 120;
  const RING_OFFSET = (RING_SIZE - BTN_SIZE) / 2;
  const SPEED_TIERS = [
    [15, 0.1, 300],
    [50, 0.1, 100],
    [100, 0.5, 100],
    [180, 1.0, 80],
  ];
  const VOL_TIERS = [
    [15, 0.02, 200],
    [50, 0.05, 100],
    [100, 0.1, 80],
  ];

  const ICONS = {
    // Rocket (speed up)
    speedUp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
    // Snail (speed down)
    speedDown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 1 0 4 0"/><circle cx="10" cy="13" r="8"/><path d="M2 21h12c4.4 0 8-3.6 8-8V7a2 2 0 1 0-4 0v6"/><path d="M18 3l1.1 2 2.9 1-2.9 1L18 9"/></svg>',
    // Speaker with waves (volume up)
    volUp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    // Speaker with one wave (volume down / volume-1)
    volDown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
  };

  const tracked = new WeakSet();

  function round1(n) { return Math.round(n * 10) / 10; }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function speedLabel(s) { return round1(s).toFixed(1) + 'x'; }
  function volLabel(v) { return Math.round(v * 100) + '%'; }

  function getTier(dist, tiers) {
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (dist >= tiers[i][0]) return tiers[i];
    }
    return null;
  }

  function makeHint(icon) {
    const el = document.createElement('div');
    const parsed = new DOMParser().parseFromString(icon, 'image/svg+xml');
    el.appendChild(document.importNode(parsed.documentElement, true));
    Object.assign(el.style, {
      position: 'absolute',
      opacity: '0',
      pointerEvents: 'none',
      background: 'rgba(0,0,0,0.45)',
      borderRadius: '50%',
      width: '28px',
      height: '28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(4px)',
      transform: 'scale(0.5)',
    });
    return el;
  }

  function attach(video) {
    if (tracked.has(video)) return;
    if (video.offsetWidth < 40 || video.offsetHeight < 40) return;
    tracked.add(video);

    // --- Container (holds ring + button + hints) ---
    const container = document.createElement('div');
    container.className = 'vsc-container';
    Object.assign(container.style, {
      position: 'absolute',
      zIndex: '2147483647',
      width: RING_SIZE + 'px',
      height: RING_SIZE + 'px',
      pointerEvents: 'none',
      opacity: '0',
      transform: 'scale(0.8) translateY(8px)',
      transformOrigin: 'center center',
    });

    // --- Ring ---
    const ring = document.createElement('div');
    ring.className = 'vsc-ring';
    Object.assign(ring.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: RING_SIZE + 'px',
      height: RING_SIZE + 'px',
      borderRadius: '50%',
      border: '2px solid rgba(255, 255, 255, 0.15)',
      boxSizing: 'border-box',
      pointerEvents: 'none',
      opacity: '0',
      transform: 'scale(0.8)',
    });
    container.appendChild(ring);

    // --- Vertical snapping marquee tooltip ---
    const shortcuts = [
      { key: 'Scroll', action: 'Speed \u00b10.1x' },
      { key: 'Click', action: 'Reset 1x' },
      { key: 'Drag \u2194', action: 'Speed' },
      { key: 'Drag \u2195', action: 'Volume' },
    ];

    const marqueeWrap = document.createElement('div');
    Object.assign(marqueeWrap.style, {
      position: 'absolute',
      top: '-26px',
      left: '50%',
      transform: 'translateX(-50%)',
      height: '20px',
      overflow: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
      borderRadius: '10px',
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(6px)',
      padding: '0 8px',
      whiteSpace: 'nowrap',
    });

    const marqueeTrack = document.createElement('div');
    Object.assign(marqueeTrack.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    });

    // Build rows (duplicate for seamless loop)
    const allShortcuts = [...shortcuts, ...shortcuts];
    allShortcuts.forEach(s => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        height: '20px',
        lineHeight: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '10px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: 'rgba(255, 255, 255, 0.7)',
      });
      const kbd = document.createElement('span');
      kbd.textContent = s.key;
      Object.assign(kbd.style, {
        display: 'inline-block',
        padding: '0 4px',
        height: '14px',
        lineHeight: '14px',
        fontSize: '9px',
        fontFamily: 'monospace, monospace',
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.9)',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '3px',
        boxShadow: '0 1px 0 rgba(255,255,255,0.1)',
      });
      const label = document.createElement('span');
      label.textContent = s.action;
      row.appendChild(kbd);
      row.appendChild(label);
      marqueeTrack.appendChild(row);
    });

    marqueeWrap.appendChild(marqueeTrack);
    container.appendChild(marqueeWrap);

    let marqueeIndex = 0;
    let marqueeTimer = null;
    let marqueeTween = null;
    function startMarquee() {
      gsap.to(marqueeWrap, { opacity: 1, duration: 0.3 });
      marqueeIndex = 0;
      gsap.set(marqueeTrack, { y: 0 });
      if (marqueeTimer) clearInterval(marqueeTimer);
      marqueeTimer = setInterval(() => {
        marqueeIndex++;
        if (marqueeIndex >= shortcuts.length) marqueeIndex = 0;
        if (marqueeTween) marqueeTween.kill();
        marqueeTween = gsap.to(marqueeTrack, {
          y: -(marqueeIndex * 20),
          duration: 0.35,
          ease: 'power2.inOut',
          ...(marqueeIndex === 0 ? { duration: 0 } : {}),
        });
      }, 2500);
    }
    function stopMarquee() {
      gsap.to(marqueeWrap, { opacity: 0, duration: 0.2 });
      if (marqueeTimer) { clearInterval(marqueeTimer); marqueeTimer = null; }
      if (marqueeTween) { marqueeTween.kill(); marqueeTween = null; }
    }

    // --- Button ---
    const btn = document.createElement('div');
    btn.className = 'vsc-btn';
    Object.assign(btn.style, {
      position: 'absolute',
      top: RING_OFFSET + 'px',
      left: RING_OFFSET + 'px',
      width: BTN_SIZE + 'px',
      height: BTN_SIZE + 'px',
      borderRadius: '10px',
      background: 'rgba(0, 0, 0, 0.5)',
      color: '#fff',
      fontSize: '13px',
      fontWeight: '600',
      fontFamily: 'monospace, monospace',
      lineHeight: BTN_SIZE + 'px',
      cursor: 'grab',
      userSelect: 'none',
      pointerEvents: 'auto',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      textAlign: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    });
    container.appendChild(btn);

    // Inner label
    const labelEl = document.createElement('span');
    labelEl.style.display = 'inline-block';
    btn.appendChild(labelEl);

    // --- Directional hint icons (positioned on the ring) ---
    const hintRight = makeHint(ICONS.speedUp);
    const hintLeft = makeHint(ICONS.speedDown);
    const hintUp = makeHint(ICONS.volUp);
    const hintDown = makeHint(ICONS.volDown);

    // Position on ring edges (center of ring = RING_SIZE/2)
    const cx = RING_SIZE / 2;
    const cy = RING_SIZE / 2;
    const hintR = 14; // half of hint size
    Object.assign(hintRight.style, { top: (cy - hintR) + 'px', left: (RING_SIZE - hintR * 2 - 2) + 'px' });
    Object.assign(hintLeft.style, { top: (cy - hintR) + 'px', left: '2px' });
    Object.assign(hintUp.style, { top: '2px', left: (cx - hintR) + 'px' });
    Object.assign(hintDown.style, { top: (RING_SIZE - hintR * 2 - 2) + 'px', left: (cx - hintR) + 'px' });

    container.appendChild(hintRight);
    container.appendChild(hintLeft);
    container.appendChild(hintUp);
    container.appendChild(hintDown);

    const allHints = [hintRight, hintLeft, hintUp, hintDown];

    function showRingAndHints() {
      gsap.to(ring, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.5)' });
      allHints.forEach(h => gsap.to(h, { opacity: 0.5, scale: 1, duration: 0.3, ease: 'back.out(1.5)' }));
    }

    function hideRingAndHints() {
      gsap.to(ring, { opacity: 0, scale: 0.8, duration: 0.2, ease: 'power2.in' });
      allHints.forEach(h => gsap.to(h, { opacity: 0, scale: 0.5, duration: 0.15, ease: 'power2.in' }));
    }

    function highlightHint(active) {
      allHints.forEach(h => {
        if (h === active) {
          gsap.to(h, { opacity: 1, scale: 1.2, duration: 0.15, ease: 'power2.out' });
          h.style.background = `rgba(${glowColor}, 0.6)`;
        } else {
          gsap.to(h, { opacity: 0.25, scale: 0.9, duration: 0.15 });
          h.style.background = 'rgba(0,0,0,0.45)';
        }
      });
    }

    function resetHintHighlights() {
      allHints.forEach(h => {
        gsap.to(h, { opacity: 0.5, scale: 1, duration: 0.1 });
        h.style.background = 'rgba(0,0,0,0.45)';
      });
    }

    // --- Hitbox overlay ---
    const hitbox = document.createElement('div');
    hitbox.className = 'vsc-hitbox';
    Object.assign(hitbox.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      zIndex: '2147483646',
      pointerEvents: 'none',
      cursor: 'grabbing',
    });
    ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt => {
      hitbox.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
    });

    function setLabel(text) {
      if (labelEl.textContent === text) return;
      gsap.to(labelEl, {
        scale: 0.7,
        opacity: 0,
        duration: 0.08,
        ease: 'power2.in',
        onComplete() {
          labelEl.textContent = text;
          gsap.to(labelEl, { scale: 1, opacity: 1, duration: 0.12, ease: 'back.out(2)' });
        }
      });
    }

    function updateLabel(mode) {
      const s = speedLabel(video.playbackRate);
      const v = volLabel(video.volume);
      if (mode === 'speed' || mode === 'volume') {
        setLabel(mode === 'speed' ? s : v);
        gsap.to(btn, { background: `rgba(${glowColor}, 0.55)`, duration: 0.2 });
        gsap.to(ring, { borderColor: `rgba(${glowColor}, 0.35)`, duration: 0.2 });
      } else {
        setLabel(s);
        gsap.to(btn, { background: 'rgba(0, 0, 0, 0.5)', duration: 0.3 });
        gsap.to(ring, { borderColor: 'rgba(255, 255, 255, 0.15)', duration: 0.3 });
      }
    }

    labelEl.textContent = speedLabel(video.playbackRate);

    // --- Adaptive glow color from video ---
    let glowColor = '150, 150, 150'; // fallback neutral
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 40;
    sampleCanvas.height = 40;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    function sampleVideoColor() {
      try {
        if (video.readyState < 2 || video.videoWidth === 0) return;
        // Sample region behind the button (bottom-right area of video)
        const sx = Math.max(0, video.videoWidth - Math.round(video.videoWidth * 0.15));
        const sy = Math.max(0, video.videoHeight - Math.round(video.videoHeight * 0.3));
        const sw = video.videoWidth - sx;
        const sh = video.videoHeight - sy;
        if (sw <= 0 || sh <= 0) return;
        sampleCtx.drawImage(video, sx, sy, sw, sh, 0, 0, 40, 40);
        const data = sampleCtx.getImageData(0, 0, 40, 40).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
        }
        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          // Boost saturation slightly so the glow is visible
          const max = Math.max(r, g, b, 1);
          const boost = Math.min(255 / max, 1.6);
          r = Math.min(255, Math.round(r * boost));
          g = Math.min(255, Math.round(g * boost));
          b = Math.min(255, Math.round(b * boost));
          glowColor = `${r}, ${g}, ${b}`;
        }
      } catch (_) { /* cross-origin — keep fallback */ }
    }

    // Sample periodically while hovering
    let colorSampleTimer = null;
    function startColorSampling() {
      sampleVideoColor();
      colorSampleTimer = setInterval(() => {
        sampleVideoColor();
        // Update glow live while hovering
        if (hoverBtn && !dragging) {
          gsap.to(btn, { boxShadow: `0 4px 16px rgba(${glowColor}, 0.45)`, duration: 0.4 });
        }
      }, 500);
    }
    function stopColorSampling() {
      if (colorSampleTimer) { clearInterval(colorSampleTimer); colorSampleTimer = null; }
    }

    // --- Positioning (bottom-right, 160px from bottom, 80px from right) ---
    function position() {
      if (!container.parentElement) return;
      container.style.top = (video.offsetTop + video.offsetHeight - 160 - RING_SIZE / 2) + 'px';
      container.style.left = (video.offsetLeft + video.offsetWidth - 80 - RING_SIZE / 2) + 'px';
    }

    const parent = video.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(container);
    parent.appendChild(hitbox);
    requestAnimationFrame(position);

    const ro = new ResizeObserver(position);
    ro.observe(video);

    // --- Hover visibility ---
    let hoverVideo = false;
    let hoverBtn = false;
    let dragging = false;
    let showTween = null;

    function show() {
      if (showTween) showTween.kill();
      showTween = gsap.to(container, {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.3,
        ease: 'back.out(1.7)',
      });
    }

    function hide() {
      if (dragging) return;
      if (showTween) showTween.kill();
      showTween = gsap.to(container, {
        opacity: 0,
        scale: 0.8,
        y: 8,
        duration: 0.2,
        ease: 'power2.in',
      });
    }

    function updateVisibility() {
      if (hoverVideo || hoverBtn || dragging) show(); else hide();
    }

    video.addEventListener('mouseenter', () => { hoverVideo = true; updateVisibility(); startColorSampling(); });
    video.addEventListener('mouseleave', () => { hoverVideo = false; updateVisibility(); if (!hoverBtn) stopColorSampling(); });

    // Button hover: show ring + hints + marquee, scale up + adaptive glow
    btn.addEventListener('mouseenter', () => {
      hoverBtn = true;
      updateVisibility();
      showRingAndHints();
      startMarquee();
      startColorSampling();
      if (!dragging) {
        sampleVideoColor();
        gsap.to(btn, {
          scale: 1.1,
          boxShadow: `0 4px 16px rgba(${glowColor}, 0.45)`,
          duration: 0.2,
          ease: 'power2.out',
        });
      }
    });
    btn.addEventListener('mouseleave', () => {
      hoverBtn = false;
      updateVisibility();
      stopColorSampling();
      if (!dragging) {
        hideRingAndHints();
        stopMarquee();
        gsap.to(btn, {
          scale: 1,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          duration: 0.25,
          ease: 'power2.out',
        });
      }
    });

    // --- Scroll (speed only) with pulse ---
    btn.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY < 0 ? 1 : -1;
      video.playbackRate = round1(clamp(video.playbackRate + dir * 0.1, MIN_SPEED, MAX_SPEED));
      updateLabel('speed');

      gsap.fromTo(btn, { scale: 1.15 }, {
        scale: hoverBtn ? 1.1 : 1,
        duration: 0.25,
        ease: 'elastic.out(1, 0.5)',
      });

      clearTimeout(btn._scrollReset);
      btn._scrollReset = setTimeout(() => updateLabel(), 600);
    }, { passive: false });

    // --- Joystick drag ---
    let originX = 0;
    let originY = 0;
    let tickTimer = null;
    let didDrag = false;

    function startTick(dx, dy) {
      stopTick();

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const horizontal = absDx > absDy;
      const dist = horizontal ? absDx : absDy;

      if (dist < DEAD_ZONE) {
        updateLabel();
        gsap.to(btn, { x: 0, y: 0, duration: 0.2, ease: 'power2.out' });
        resetHintHighlights();
        return;
      }

      const maxDisplace = 12;
      const displaceX = clamp(dx * 0.15, -maxDisplace, maxDisplace);
      const displaceY = clamp(dy * 0.15, -maxDisplace, maxDisplace);
      gsap.to(btn, { x: displaceX, y: displaceY, duration: 0.1, ease: 'power2.out' });

      if (horizontal) {
        const tier = getTier(dist, SPEED_TIERS);
        if (!tier) return;
        const dir = dx > 0 ? 1 : -1;
        const [, step, interval] = tier;
        updateLabel('speed');
        highlightHint(dir > 0 ? hintRight : hintLeft, 'speed');

        video.playbackRate = round1(clamp(video.playbackRate + dir * step, MIN_SPEED, MAX_SPEED));
        updateLabel('speed');

        tickTimer = setInterval(() => {
          video.playbackRate = round1(clamp(video.playbackRate + dir * step, MIN_SPEED, MAX_SPEED));
          updateLabel('speed');
        }, interval);
      } else {
        const tier = getTier(dist, VOL_TIERS);
        if (!tier) return;
        const dir = dy < 0 ? 1 : -1;
        const [, step, interval] = tier;
        updateLabel('volume');
        highlightHint(dir > 0 ? hintUp : hintDown, 'volume');

        video.volume = clamp(video.volume + dir * step, MIN_VOL, MAX_VOL);
        video.muted = false;
        updateLabel('volume');

        tickTimer = setInterval(() => {
          video.volume = clamp(video.volume + dir * step, MIN_VOL, MAX_VOL);
          video.muted = false;
          updateLabel('volume');
        }, interval);
      }
    }

    function stopTick() {
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    }

    // --- Pointer-capture based drag ---
    // setPointerCapture routes ALL pointer events to btn, so we listen on btn not document

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      btn.setPointerCapture(e.pointerId);

      dragging = true;
      didDrag = false;
      originX = e.clientX;
      originY = e.clientY;

      hitbox.style.pointerEvents = 'auto';
      showRingAndHints();

      gsap.to(btn, {
        scale: 0.95,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        duration: 0.1,
        ease: 'power2.in',
      });
      gsap.to(ring, { borderColor: 'rgba(255, 255, 255, 0.3)', borderWidth: '2.5px', duration: 0.15 });

      btn.style.cursor = 'grabbing';
      updateVisibility();
    });

    btn.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - originX;
      const dy = e.clientY - originY;

      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) didDrag = true;

      startTick(dx, dy);
    });

    btn.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      try { btn.releasePointerCapture(e.pointerId); } catch (_) {}

      if (!dragging) return;
      const wasDrag = didDrag;
      dragging = false;
      stopTick();
      btn.style.cursor = 'grab';

      hitbox.style.pointerEvents = 'none';

      if (!hoverBtn) { hideRingAndHints(); stopMarquee(); }
      else resetHintHighlights();

      gsap.to(ring, { borderWidth: '2px', duration: 0.2 });

      gsap.to(btn, {
        x: 0,
        y: 0,
        scale: hoverBtn ? 1.1 : 1,
        boxShadow: hoverBtn ? `0 4px 16px rgba(${glowColor}, 0.45)` : '0 2px 8px rgba(0,0,0,0.3)',
        duration: 0.4,
        ease: 'elastic.out(1, 0.4)',
      });

      updateLabel();
      updateVisibility();

      // Click (no drag) → reset to 1x
      if (!wasDrag) {
        video.playbackRate = 1;
        updateLabel();
        gsap.fromTo(btn,
          { background: 'rgba(255, 255, 255, 0.5)' },
          { background: 'rgba(0, 0, 0, 0.5)', duration: 0.4 }
        );
        gsap.fromTo(btn, { scale: 1.15 }, {
          scale: hoverBtn ? 1.1 : 1,
          duration: 0.3,
          ease: 'back.out(2)',
        });
      }
    });

    // Also handle lostpointercapture as a safety net
    btn.addEventListener('lostpointercapture', () => {
      if (dragging) {
        dragging = false;
        stopTick();
        btn.style.cursor = 'grab';
        hitbox.style.pointerEvents = 'none';
        if (!hoverBtn) { hideRingAndHints(); stopMarquee(); }
        gsap.to(btn, { x: 0, y: 0, scale: 1, duration: 0.3, ease: 'power2.out' });
        updateLabel();
        updateVisibility();
      }
    });

    // Block click/dblclick from reaching the video
    const blockClick = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    btn.addEventListener('click', blockClick, true);
    btn.addEventListener('click', blockClick, false);
    btn.addEventListener('dblclick', blockClick, true);
    btn.addEventListener('dblclick', blockClick, false);
    // Also block on hitbox (catches clicks during/after drag anywhere on video)
    hitbox.addEventListener('click', blockClick, true);
    hitbox.addEventListener('dblclick', blockClick, true);

    // --- Sync external changes ---
    video.addEventListener('ratechange', () => { if (!dragging) updateLabel(); });
    video.addEventListener('volumechange', () => { if (!dragging) updateLabel(); });

    // --- Cleanup ---
    const cleanup = new MutationObserver(() => {
      if (!document.contains(video)) {
        ro.disconnect();
        cleanup.disconnect();
        stopTick();
        stopColorSampling();
        if (showTween) showTween.kill();
        container.remove();
        hitbox.remove();
        tracked.delete(video);
      }
    });
    cleanup.observe(document.body, { childList: true, subtree: true });
  }

  function scan() {
    document.querySelectorAll('video').forEach(attach);
  }

  scan();

  // MutationObserver for dynamic videos
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });

  // Periodic re-scan for SPA navigations (Shorts, etc.)
  setInterval(scan, 2000);
})();
