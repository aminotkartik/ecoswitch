/* ==========================================================================
   EcoSwitch — script.js
   Vanilla JavaScript. No dependencies, no build step.

   Modules
   00  Utilities
   01  Navigation (scroll state, mobile menu, active link, scroll progress)
   02  Reveal-on-scroll (IntersectionObserver)
   03  Animated counters
   04  Zone state engine (shared simulation model)
   05  Renderers — hero monitor, zone explorer, live readout, monitor stats
   06  Interactive zone explorer (section 03)
   07  Fifteen-minute logic timeline (section 05)
   08  Zoning comparison rooms (section 09)
   09  Page visibility handling
   ========================================================================== */
(function () {
  'use strict';

  /* ========================================================================
     00. UTILITIES
     ======================================================================== */
  var doc = document;
  var $ = function (sel, root) { return (root || doc).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefersReduced = motionQuery.matches;

  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var fmtClock = function (seconds) {
    var s = Math.max(0, Math.floor(seconds));
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  };
  var clamp = function (v, min, max) { return Math.min(max, Math.max(min, v)); };
  var rand = function (min, max) { return min + Math.random() * (max - min); };
  var chance = function (p) { return Math.random() < p; };
  var setText = function (el, value) { if (el && el.textContent !== value) el.textContent = value; };
  var toggleClass = function (el, cls, on) { if (el) el.classList.toggle(cls, !!on); };

  doc.documentElement.classList.add('js');

  /* Reduced motion: keep the data live, but slow every simulation down. */
  var MOTION_SCALE = prefersReduced ? 3 : 1;

  /* ------------------------------------------------------------------------
     Simple interval wrapper so every loop can be paused (page hidden, etc.)
     ------------------------------------------------------------------------ */
  var loops = [];
  function createLoop(callback, interval, autoResume) {
    var id = null;
    var loop = {
      autoResume: !!autoResume,
      start: function () { if (id === null) id = window.setInterval(callback, interval); },
      stop: function () { if (id !== null) { window.clearInterval(id); id = null; } },
      isRunning: function () { return id !== null; }
    };
    loops.push(loop);
    return loop;
  }

  /* ========================================================================
     01. NAVIGATION
     ======================================================================== */
  (function initNav() {
    var nav = $('#nav');
    var toggle = $('#navToggle');
    var menu = $('#navMenu');
    var bar = $('#scrollBar');
    if (!nav) return;

    function closeMenu() {
      nav.classList.remove('is-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }

    if (toggle) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    if (menu) {
      menu.addEventListener('click', function (event) {
        if (event.target.closest('a')) closeMenu();
      });
    }

    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMenu();
    });

    doc.addEventListener('click', function (event) {
      if (!nav.classList.contains('is-open')) return;
      if (!nav.contains(event.target)) closeMenu();
    });

    /* scroll state + progress bar */
    var ticking = false;
    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      nav.classList.toggle('is-scrolled', y > 12);
      if (bar) {
        var docHeight = doc.documentElement.scrollHeight - window.innerHeight;
        var progress = docHeight > 0 ? clamp(y / docHeight, 0, 1) : 0;
        bar.style.width = (progress * 100).toFixed(2) + '%';
      }
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();

    /* active section link */
    var links = $$('.nav__list a');
    var sections = links
      .map(function (link) {
        var id = link.getAttribute('href');
        return id && id.charAt(0) === '#' ? $(id) : null;
      })
      .filter(Boolean);

    if (sections.length && 'IntersectionObserver' in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          links.forEach(function (link) {
            var active = link.getAttribute('href') === '#' + entry.target.id;
            link.classList.toggle('is-current', active);
            if (active) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
          });
        });
      }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
      sections.forEach(function (section) { spy.observe(section); });
    }
  }());

  /* ========================================================================
     02. REVEAL ON SCROLL
     ------------------------------------------------------------------------
     An IntersectionObserver drives the timing, and a cheap scroll sweep acts
     as a safety net so nothing is ever left invisible after a jump, a hash
     link or a very fast scroll.
     ======================================================================== */
  var revealObserver = null;
  var pendingReveals = [];
  var sweepTicking = false;
  var sweepLoop = null;

  function revealElement(el) {
    if (!el || el.classList.contains('is-visible')) return;
    el.classList.add('is-visible');
    if (el.hasAttribute('data-count')) countUp(el);
    /* the transition stays applied so a later subtree removal still animates */
    window.setTimeout(function () {
      if (el.isConnected) el.classList.add('is-settled');
    }, 2200);
  }

  function sweepReveals() {
    sweepTicking = false;
    if (!pendingReveals.length) return;
    var limit = window.innerHeight + 140;
    pendingReveals = pendingReveals.filter(function (el) {
      if (!el.isConnected) return false;
      if (el.getBoundingClientRect().top < limit) { revealElement(el); return false; }
      return true;
    });
    if (!pendingReveals.length && sweepLoop) sweepLoop.stop();
  }

  function requestSweep() {
    if (sweepTicking) return;
    sweepTicking = true;
    window.requestAnimationFrame(sweepReveals);
  }

  (function initReveal() {
    $$('[data-delay]').forEach(function (el) {
      el.style.setProperty('--d', el.getAttribute('data-delay'));
    });

    var targets = $$('.reveal, .process, .road__step, .clock, [data-count]');
    pendingReveals = targets.slice();

    if (!('IntersectionObserver' in window)) {
      targets.forEach(revealElement);
      pendingReveals = [];
      return;
    }

    revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        revealElement(entry.target);
        var index = pendingReveals.indexOf(entry.target);
        if (index > -1) pendingReveals.splice(index, 1);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.12 });

    targets.forEach(function (el) { revealObserver.observe(el); });

    /* safety net: frames + a slow interval that retires itself */
    window.addEventListener('scroll', requestSweep, { passive: true });
    window.addEventListener('resize', requestSweep, { passive: true });
    window.addEventListener('load', requestSweep);
    window.addEventListener('hashchange', requestSweep);
    /* 300 ms while elements are pending; the loop retires itself when done */
    sweepLoop = createLoop(sweepReveals, 300, true);
    sweepLoop.start();
    requestSweep();
  }());

  /* ========================================================================
     03. ANIMATED COUNTERS
     ======================================================================== */
  function countUp(el) {
    if (el.dataset.counted === 'true' || !el.hasAttribute('data-count')) return;
    el.dataset.counted = 'true';

    var target = parseFloat(el.getAttribute('data-count'));
    var padTo = el.hasAttribute('data-pad') ? 2 : 0;
    if (isNaN(target)) return;

    if (prefersReduced) {
      el.textContent = padTo ? String(target).padStart(padTo, '0') : String(target);
      return;
    }

    var start = performance.now();
    var duration = 1400;
    (function step(now) {
      var t = clamp((now - start) / duration, 0, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      var value = Math.round(target * eased);
      el.textContent = padTo ? String(value).padStart(padTo, '0') : String(value);
      if (t < 1) window.requestAnimationFrame(step);
      else el.textContent = padTo ? String(target).padStart(padTo, '0') : String(target);
    }(start));
  }

  /* ========================================================================
     04. ZONE STATE ENGINE
     ------------------------------------------------------------------------
     One classroom model drives every live panel on the page, so the hero
     monitor, the interactive plan and the readout never disagree.

     State per zone
       presence  boolean  — validated occupancy
       idle      seconds  — time since last validated activity
       beamBreak boolean  — a beam is currently interrupted
       pulse     number   — UI counter used for the "person arrived" flash
     ======================================================================== */
  var IDLE_WARN = 600;     /* 10 minutes → buzzer warning     */
  var IDLE_LIMIT = 900;    /* 15 minutes → power control      */
  var SPEED = 5 * MOTION_SCALE; /* simulated seconds per real second */

  var PLAN_PHASES = {
    active:  { state: 'OCCUPIED', power: 'ON',      label: 'Occupied', pill: 'pill--live',    dot: 'dot--green' },
    idle:    { state: 'EMPTY',    power: 'ON',      label: 'Empty',    pill: 'pill--muted',   dot: 'dot--off' },
    warning: { state: 'EMPTY',    power: 'WARNING', label: 'Warning',  pill: 'pill--warn',    dot: 'dot--amber' },
    standby: { state: 'EMPTY',    power: 'OFF',     label: 'Standby',  pill: 'pill--standby', dot: 'dot--off' }
  };

  var PHASE_NOTES = {
    active: 'Occupied zones hold their timer at zero. The timer only advances when no validated activity reaches this zone\u2019s sensors.',
    idle: 'No validated activity in this zone. The inactivity timer is running; power remains on until the warning and control thresholds are reached.',
    warning: 'Ten minutes of inactivity have passed. The buzzer is warning the room \u2014 any validated activity resets the timer immediately.',
    standby: 'Fifteen minutes of inactivity. This zone\u2019s controlled loads are in standby, and sensing stays live so the zone wakes on the next valid activity.'
  };

  function createZone(id, occupied, idle) {
    return { id: id, presence: occupied, idle: idle, beamBreak: false, pulse: 0 };
  }

  var zones = [
    createZone(1, true, 0),
    createZone(2, false, 8 * 60 + 42),
    createZone(3, true, 0),
    createZone(4, false, 13 * 60 + 17)
  ];

  function zoneById(id) {
    for (var i = 0; i < zones.length; i++) if (zones[i].id === id) return zones[i];
    return null;
  }

  function phaseOf(zone) {
    if (zone.presence) return 'active';
    if (zone.idle >= IDLE_LIMIT) return 'standby';
    if (zone.idle >= IDLE_WARN) return 'warning';
    return 'idle';
  }

  function powerOn(phase) { return phase === 'active' || phase === 'idle' || phase === 'warning'; }

  /* --- engine step ------------------------------------------------------- */
  var listeners = [];
  function onZoneUpdate(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { fn(zones); }); }

  function stepEngine() {
    zones.forEach(function (zone) {
      if (zone.presence) {
        zone.idle = 0;
      } else {
        zone.idle = Math.min(zone.idle + SPEED, IDLE_LIMIT + 600);
      }

      /* beam-break flash decays on its own */
      if (zone.beamBreak && chance(0.5)) zone.beamBreak = false;

      /* scenario events: people arrive and leave while the page is open */
      var phase = phaseOf(zone);
      if (zone.presence && chance(0.012)) {
        zone.presence = false;
        zone.idle = 0;
        zone.beamBreak = true;
      } else if (!zone.presence && (phase === 'standby' || phase === 'warning') && chance(0.05)) {
        zone.presence = true;
        zone.idle = 0;
        zone.beamBreak = true;
        zone.pulse++;
      } else if (!zone.presence && phase === 'idle' && chance(0.02)) {
        zone.presence = true;
        zone.idle = 0;
        zone.beamBreak = true;
        zone.pulse++;
      }
    });

    /* something is always happening in a classroom */
    if (!zones.some(function (z) { return z.presence; })) {
      var pick = zones[Math.floor(rand(0, zones.length))];
      pick.presence = true;
      pick.idle = 0;
      pick.beamBreak = true;
      pick.pulse++;
    }

    emit();
  }

  var engineLoop = createLoop(stepEngine, 1000 * MOTION_SCALE, true);

  /* ========================================================================
     05. RENDERERS
     ======================================================================== */
  /* --- classroom plan (hero + section 03) -------------------------------- */
  function renderPlan(root) {
    if (!root) return;
    zones.forEach(function (zone) {
      var phase = phaseOf(zone);
      var meta = PLAN_PHASES[phase];
      var group = $('.zone[data-zone="' + zone.id + '"]', root);
      if (group) {
        toggleClass(group, 'is-occupied', zone.presence);
        toggleClass(group, 'is-empty', !zone.presence);
        toggleClass(group, 'is-on', powerOn(phase));
        toggleClass(group, 'is-standby', phase === 'standby');
        toggleClass(group, 'is-warning', phase === 'warning');
        setText($('[data-role="state"]', group), meta.state);
        setText($('[data-role="idle"]', group), 'IDLE ' + fmtClock(zone.idle));
      }
      var row = $('.beam-row[data-zone="' + zone.id + '"]', root);
      toggleClass(row, 'is-broken', zone.beamBreak);
    });
  }

  /* --- hero monitor summary --------------------------------------------- */
  var monitorNodes = {
    zones: $('[data-role="heroZones"]'),
    idle: $('[data-role="heroIdle"]'),
    relays: $('[data-role="heroRelays"]'),
    chipSensor: $('[data-role="heroChipSensor"]'),
    chipTimer: $('[data-role="heroChipTimer"]')
  };

  function renderMonitor() {
    var occupied = zones.filter(function (z) { return z.presence; }).length;
    var longest = zones.reduce(function (max, z) { return z.presence ? max : Math.max(max, z.idle); }, 0);
    var relays = zones.filter(function (z) { return powerOn(phaseOf(z)); }).length;

    setText(monitorNodes.zones, occupied + ' / ' + zones.length);
    setText(monitorNodes.idle, fmtClock(longest));
    setText(monitorNodes.relays, String(relays));

    /* the busiest zone tells the story in the floating chips */
    var busiest = zones.slice().sort(function (a, b) { return b.idle - a.idle; })[0];
    var broken = zones.filter(function (z) { return z.beamBreak; })[0];
    setText(monitorNodes.chipSensor, broken ? 'Beam 0' + broken.id + ' interrupted' : 'All beams intact');
    setText(monitorNodes.chipTimer, busiest && busiest.idle > 0 ? 'Timer running' : 'All zones active');
  }

  /* --- live readout cards (section 07) ----------------------------------- */
  var readoutCards = {};
  function initReadout() {
    $$('.zcard').forEach(function (card) {
      var id = parseInt(card.getAttribute('data-zone'), 10);
      if (isNaN(id)) return;
      readoutCards[id] = {
        card: card,
        state: $('[data-role="state"]', card),
        presence: $('[data-role="presence"]', card),
        idle: $('[data-role="idle"]', card),
        power: $('[data-role="power"]', card),
        bar: $('[data-role="bar"]', card),
        seenPulse: 0
      };
    });
  }

  function renderReadout() {
    zones.forEach(function (zone) {
      var ref = readoutCards[zone.id];
      if (!ref) return;
      var phase = phaseOf(zone);
      var meta = PLAN_PHASES[phase];

      var cardState = phase === 'active' ? 'occupied' : phase;
      ref.card.setAttribute('data-state', cardState);
      ref.state.innerHTML = '<span class="dot ' + meta.dot + '"></span>' + meta.label;
      setText(ref.presence, zone.presence ? 'YES' : 'NO');
      setText(ref.idle, fmtClock(zone.idle));
      setText(ref.power, meta.power);

      var pct = zone.presence ? 2 : clamp((zone.idle / IDLE_LIMIT) * 100, 2, 100);
      ref.bar.style.width = pct.toFixed(1) + '%';

      /* flash when a new occupancy event lands in this zone */
      if (ref.seenPulse !== zone.pulse) {
        ref.seenPulse = zone.pulse;
        ref.card.classList.remove('is-resetting');
        void ref.card.offsetWidth;
        ref.card.classList.add('is-resetting');
        window.setTimeout(function () { ref.card.classList.remove('is-resetting'); }, 1400);
      }
    });
  }

  /* --- zone explorer detail panel (section 03) --------------------------- */
  var liveStatus = $('[data-role="liveStatus"]');
  var detailNodes = {
    panel: $('#zoneDetail'),
    zone: $('[data-role="zoneName"]'),
    pill: $('[data-role="statePill"]'),
    presence: $('[data-role="dPresence"]'),
    idle: $('[data-role="dIdle"]'),
    beam: $('[data-role="dBeam"]'),
    loads: $('[data-role="dLoads"]'),
    power: $('[data-role="dPower"]'),
    meter: $('[data-role="dMeter"]'),
    timer: $('[data-role="dTimer"]'),
    note: $('[data-role="dNote"]')
  };
  var selectedZoneId = 1;

  function renderDetail() {
    var zone = zoneById(selectedZoneId);
    if (!zone || !detailNodes.panel) return;
    var phase = phaseOf(zone);
    var meta = PLAN_PHASES[phase];

    setText(detailNodes.zone, 'ZONE 0' + zone.id);
    if (detailNodes.pill) {
      detailNodes.pill.className = 'pill ' + meta.pill;
      detailNodes.pill.innerHTML = '<span class="dot ' + meta.dot + '"></span>' + meta.label;
    }
    setText(detailNodes.presence, zone.presence ? 'Detected' : 'Not detected');
    setText(detailNodes.idle, fmtClock(zone.idle));
    setText(detailNodes.beam, zone.beamBreak || zone.presence ? 'Interrupted \u2014 activity' : 'Intact \u2014 no activity');
    setText(detailNodes.loads, '2 lights \u00b7 2 fans');

    if (detailNodes.power) {
      var powerLabel = phase === 'standby' ? 'POWER OFF \u00b7 STANDBY' : (phase === 'warning' ? 'POWER ON \u00b7 WARNING' : 'POWER ON');
      var powerClass = phase === 'standby' ? 'pill pill--standby' : (phase === 'warning' ? 'pill pill--warn' : 'pill pill--on');
      detailNodes.power.innerHTML = '<span class="' + powerClass + '">' + powerLabel + '</span>';
    }

    var pct = zone.presence ? 0 : clamp((zone.idle / IDLE_LIMIT) * 100, 0, 100);
    if (detailNodes.meter) detailNodes.meter.style.width = pct.toFixed(1) + '%';
    setText(detailNodes.timer, fmtClock(zone.idle) + ' / 15:00');
    setText(detailNodes.note, PHASE_NOTES[phase]);

    detailNodes.panel.classList.toggle('is-warning', phase === 'warning');
    detailNodes.panel.classList.toggle('is-standby', phase === 'standby');
  }

  /* --- master render ----------------------------------------------------- */
  function renderAll() {
    renderPlan($('.plan--hero'));
    renderPlan($('.plan--zones'));
    renderMonitor();
    renderReadout();
    renderDetail();
  }

  /* ========================================================================
     06. INTERACTIVE ZONE EXPLORER (section 03)
     ======================================================================== */
  (function initExplorer() {
    var plan = $('.plan--zones');
    var hits = $$('.zone-hit');
    var buttons = $$('.zone-btn');
    if (!plan || !hits.length) return;

    var hoverTimer = null;

    function highlight(id) {
      plan.classList.add('has-selection');
      $$('.zone', plan).forEach(function (group) {
        group.classList.toggle('is-active', group.getAttribute('data-zone') === String(id));
      });
      $$('.beam-row', plan).forEach(function (row) {
        row.classList.toggle('is-active', row.getAttribute('data-zone') === String(id));
      });
      hits.forEach(function (hit) {
        hit.classList.toggle('is-active', hit.getAttribute('data-zone') === String(id));
      });
      buttons.forEach(function (btn) {
        var active = btn.getAttribute('data-zone') === String(id);
        btn.classList.toggle('is-selected', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function select(id) {
      if (selectedZoneId === id && plan.classList.contains('has-selection')) return;
      selectedZoneId = id;
      highlight(id);
      renderDetail();

      /* announce the selection once — the ticking values stay silent */
      if (liveStatus) {
        var zone = zoneById(id);
        var phase = phaseOf(zone);
        liveStatus.textContent = 'Zone 0' + id + ' selected: ' +
          PLAN_PHASES[phase].label.toLowerCase() +
          ', idle ' + fmtClock(zone.idle) +
          ', power ' + PLAN_PHASES[phase].power + '.';
      }
    }

    hits.forEach(function (hit) {
      var id = parseInt(hit.getAttribute('data-zone'), 10);
      hit.addEventListener('pointerenter', function () {
        window.clearTimeout(hoverTimer);
        hoverTimer = window.setTimeout(function () { select(id); }, 90);
      });
      hit.addEventListener('focus', function () { select(id); });
      hit.addEventListener('click', function () { select(id); });
      hit.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select(id);
        }
      });
    });

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        select(parseInt(btn.getAttribute('data-zone'), 10));
      });
    });

    select(selectedZoneId);
  }());

  /* ========================================================================
     07. FIFTEEN-MINUTE LOGIC TIMELINE (section 05)
     ======================================================================== */
  (function initLogic() {
    var root = $('.logic');
    if (!root) return;

    var clock = $('.clock', root);
    var ring = $('[data-role="clockRing"]', root);
    var timeLabel = $('[data-role="clockTime"]', root);
    var subLabel = $('[data-role="clockSub"]', root);
    var pill = $('[data-role="logicPill"]', root);
    var steps = $$('.tl', root);
    var resetBtn = $('[data-role="logicReset"]', root);
    var pauseBtn = $('[data-role="logicPause"]', root);
    var pauseLabel = $('[data-role="logicPauseLabel"]', root);
    var liveEl = $('#heroLive');

    var CIRCUMFERENCE = 553;
    var TICK_MS = 240;
    var STEP_SECONDS = 8 * MOTION_SCALE;   /* simulated seconds per tick */
    var HOLD_MS = prefersReduced ? 1200 : 3200;

    var elapsed = 0;
    var holding = false;
    var holdTimer = null;

    var PHASES = [
      { key: 'active', at: 0,   label: 'Active',        pill: 'pill--live',  dot: 'dot--green', sub: 'of 15:00 \u00b7 active' },
      { key: 'idle', at: 300,   label: 'Idle',          pill: 'pill--blue',  dot: 'dot--blue',  sub: 'of 15:00 \u00b7 no activity' },
      { key: 'warning', at: 600, label: 'Warning',      pill: 'pill--warn',  dot: 'dot--amber', sub: 'of 15:00 \u00b7 buzzer active' },
      { key: 'power', at: 900,  label: 'Power control', pill: 'pill--on',    dot: 'dot--green', sub: 'of 15:00 \u00b7 loads disabled' }
    ];

    function phaseIndex() {
      if (elapsed >= PHASES[3].at) return 3;
      if (elapsed >= PHASES[2].at) return 2;
      if (elapsed >= PHASES[1].at) return 1;
      return 0;
    }

    function render() {
      var index = phaseIndex();
      var phase = PHASES[index];
      var progress = clamp(elapsed / PHASES[3].at, 0, 1);

      if (ring) ring.style.strokeDashoffset = (CIRCUMFERENCE * (1 - progress)).toFixed(1);
      setText(timeLabel, fmtClock(elapsed));
      setText(subLabel, phase.sub);

      if (pill) {
        pill.className = 'pill ' + phase.pill;
        pill.innerHTML = '<span class="dot ' + phase.dot + '"></span>' + phase.label;
      }

      if (clock) {
        clock.classList.toggle('is-warning', index === 2);
        clock.classList.toggle('is-power', index === 3);
      }

      steps.forEach(function (step) {
        var stage = parseInt(step.getAttribute('data-stage'), 10);
        step.classList.toggle('is-active', stage === index);
        step.classList.toggle('is-passed', stage < index);
      });
    }

    function reset(reason) {
      elapsed = 0;
      holding = false;
      window.clearTimeout(holdTimer);
      render();
      if (reason === 'activity' && clock) {
        clock.classList.add('is-resetting');
        window.setTimeout(function () { clock.classList.remove('is-resetting'); }, 900);
      }
    }

    function tick() {
      if (holding) return;
      elapsed += STEP_SECONDS;
      if (elapsed >= PHASES[3].at) {
        elapsed = PHASES[3].at;
        holding = true;
        holdTimer = window.setTimeout(function () { reset('loop'); }, HOLD_MS);
      }
      render();
    }

    var userPaused = false;
    var loop = createLoop(tick, TICK_MS * MOTION_SCALE, false);
    loop.start();
    render();

    function setPaused(paused) {
      userPaused = paused;
      if (paused) loop.stop();
      else loop.start();
      if (pauseBtn) {
        pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
        setText(pauseLabel, paused ? 'Resume' : 'Pause');
      }
      if (clock) clock.style.opacity = paused ? '0.7' : '1';
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        reset('activity');
        setPaused(false);
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', function () { setPaused(!userPaused); });
    }

    /* small API for the page-visibility handler */
    window.__ecoswitchLogic = {
      stop: function () { loop.stop(); },
      resume: function () { if (!userPaused) loop.start(); }
    };
  }());

  /* ========================================================================
     08. ZONING COMPARISON ROOMS (section 09)
     ======================================================================== */
  (function initMiniRooms() {
    var traditional = $('.miniroom--old');
    var modern = $('.miniroom--new');
    if (!traditional || !modern) return;

    function pattern() {
      var zones = [0, 1, 2, 3].map(function () { return chance(0.5); });
      zones[0] = true;                                       /* never an entirely empty room */
      if (!zones.some(function (v) { return v === false; })) zones[3] = false;
      return zones;
    }

    function paint(room, flags, controlled) {
      $$('.miniz', room).forEach(function (tile, index) {
        var occupied = flags[index];
        toggleClass(tile, 'is-occupied', occupied);

        if (controlled) {
          /* EcoSwitch: power follows occupancy */
          toggleClass(tile, 'is-lit', occupied);
          toggleClass(tile, 'is-off', !occupied);
          tile.setAttribute('data-state', occupied ? 'ON' : 'STANDBY');
        } else {
          /* traditional: everything stays powered */
          tile.classList.add('is-lit');
          tile.classList.remove('is-off');
          tile.setAttribute('data-state', 'ON');
        }
      });
    }

    function cycle() {
      var flags = pattern();
      paint(traditional, flags, false);
      paint(modern, flags, true);
    }

    cycle();
    createLoop(cycle, 6200 * MOTION_SCALE).start();
  }());

  /* ========================================================================
     09. PAGE VISIBILITY — pause every simulation when the tab is hidden
     ======================================================================== */
  (function initVisibility() {
    var liveEl = $('#heroLive');
    var label = liveEl ? $('.live__label', liveEl) : null;

    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) {
        loops.forEach(function (loop) { loop.stop(); });
        if (liveEl) {
          liveEl.classList.add('is-paused');
          setText(label, 'Paused');
        }
      } else {
        /* restart every loop that is meant to run continuously */
        loops.forEach(function (loop) { if (loop.autoResume) loop.start(); });
        if (window.__ecoswitchLogic) window.__ecoswitchLogic.resume();
        if (liveEl) {
          liveEl.classList.remove('is-paused');
          setText(label, 'Live system');
        }
      }
    });
  }());

  /* ========================================================================
     BOOT — wire everything together
     ======================================================================== */
  function initReadoutLoop() {
    if (!initReadoutLoop.loop) {
      initReadoutLoop.loop = createLoop(renderReadout, 1000 * MOTION_SCALE, true);
    }
    initReadoutLoop.loop.start();
  }

  initReadout();
  renderAll();
  onZoneUpdate(renderAll);

  engineLoop.start();
  initReadoutLoop();

  /* keep the timer texts in sync between engine ticks */
  createLoop(function () {
    renderMonitor();
    renderDetail();
  }, 500 * MOTION_SCALE, true).start();

  /* final pass once fonts and images have settled the layout */
  window.addEventListener('load', function () { renderAll(); });

  /* signal to the early head script that the application really started */
  window.__ecoswitchReady = true;
}());
