'use client';

import { useEffect } from 'react';
import * as THREE from 'three';

interface Star {
  x: number; y: number; r: number; phase: number;
}
interface Nebula {
  x: number; y: number; rx: number; ry: number; c: string;
}

interface PlanetDef {
  name: string;
  info: string;
  texture: string;
  size: number;
  orbitR: number;
  period: number;
  offset: number;
  tilt: number; // axial tilt in radians
  spin: number; // radians/sec
  hasRings?: boolean;
}

interface BodyRef {
  name: string;
  info: string;
  orbitGroup: THREE.Group;       // holds orbital position
  tiltGroup: THREE.Group;        // holds axial tilt
  mesh: THREE.Mesh;              // the planet sphere
  hitMesh: THREE.Mesh;           // invisible larger mesh for easy hover
  orbitLine?: THREE.LineLoop;
  spin: number;
}

export default function OrreryPage() {
  useEffect(() => {
    // ─── Background (stars + nebulae, 2D canvas) ──────────────────────────────
    const bgCanvas = document.getElementById('bg') as HTMLCanvasElement;
    const bgCtx = bgCanvas.getContext('2d')!;
    let stars: Star[] = [];
    let nebulae: Nebula[] = [];
    // Logical (CSS) size of the background; drawing code operates in these
    // units while the backing store is scaled up for the device's pixel ratio
    // so stars/nebulae stay crisp on high-DPI phones & retina displays.
    let bgW = 0;
    let bgH = 0;

    function initBg() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      bgW = window.innerWidth;
      bgH = window.innerHeight;
      bgCanvas.width  = Math.round(bgW * dpr);
      bgCanvas.height = Math.round(bgH * dpr);
      bgCanvas.style.width  = `${bgW}px`;
      bgCanvas.style.height = `${bgH}px`;
      // Reset any previous transform, then scale so 1 drawing unit = 1 CSS px.
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Scale star count with viewport area so mobile isn't too sparse and
      // huge displays aren't too dense. ~1 star per 7000 px² of viewport.
      const starCount = Math.round(
        Math.min(700, Math.max(200, (bgW * bgH) / 7000)),
      );
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * bgW,
        y: Math.random() * bgH,
        r: 0.3 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2,
      }));

      nebulae = [
        { x: bgW * 0.22, y: bgH * 0.28, rx: 380, ry: 240, c: 'rgba(80,20,130,0.07)' },
        { x: bgW * 0.78, y: bgH * 0.72, rx: 300, ry: 400, c: 'rgba(140,40,20,0.055)' },
        { x: bgW * 0.60, y: bgH * 0.18, rx: 220, ry: 200, c: 'rgba(20,55,130,0.045)' },
      ];
    }

    function drawBg(ts: number) {
      bgCtx.clearRect(0, 0, bgW, bgH);
      nebulae.forEach(n => {
        const mx = Math.max(n.rx, n.ry);
        const g = bgCtx.createRadialGradient(n.x, n.y, 0, n.x, n.y, mx);
        g.addColorStop(0, n.c);
        g.addColorStop(1, 'transparent');
        bgCtx.save();
        bgCtx.translate(n.x, n.y);
        bgCtx.scale(n.rx / mx, n.ry / mx);
        bgCtx.beginPath();
        bgCtx.arc(0, 0, mx, 0, Math.PI * 2);
        bgCtx.fillStyle = g;
        bgCtx.fill();
        bgCtx.restore();
      });
      stars.forEach(s => {
        const o = 0.22 + 0.58 * Math.sin(ts * 0.00065 + s.phase);
        bgCtx.beginPath();
        bgCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        bgCtx.fillStyle = `rgba(255,235,180,${o})`;
        bgCtx.fill();
      });
    }

    // ─── Three.js orrery ──────────────────────────────────────────────────────
    const oc = document.getElementById('orrery-canvas') as HTMLCanvasElement;

    const renderer = new THREE.WebGLRenderer({
      canvas: oc,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    // Cap at 3 — modern phones report DPR=3, and 3x is the practical limit
    // where extra pixels still buy perceptible sharpness on a WebGL scene
    // this small. Going higher is pure GPU cost.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));

    function sizeRenderer() {
      const rect = oc.getBoundingClientRect();
      // Guard against zero-sized layouts (e.g. hidden during initial paint).
      if (rect.width === 0 || rect.height === 0) return;
      // Keep pixel ratio in sync in case the user drags the window between
      // retina and non-retina displays, or the system zoom level changes.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
      renderer.setSize(rect.width, rect.height, false);
    }
    sizeRenderer();

    const scene = new THREE.Scene();

    // Orthographic camera with a subtle tilt so planet spheres read as 3D
    // while orbit circles remain near-circles.
    const FRUSTUM = 450;
    const camera = new THREE.OrthographicCamera(
      -FRUSTUM, FRUSTUM, FRUSTUM, -FRUSTUM, 0.1, 4000,
    );
    const CAM_TILT = 0.38; // ~22° off vertical
    const CAM_DIST = 1200;
    camera.position.set(
      0,
      CAM_DIST * Math.cos(CAM_TILT),
      CAM_DIST * Math.sin(CAM_TILT),
    );
    camera.lookAt(0, 0, 0);

    // Lights — point light at the Sun gives realistic phase shading on
    // planets. decay=0 keeps outer planets from being too dim; physical decay
    // would make Neptune ~36× darker than Mercury. The MeshStandardMaterial
    // BRDF divides Lambert by π which eats ~70% of the light, so we push the
    // Sun intensity well above unity to get vibrant planets.
    const sunLight = new THREE.PointLight(0xfff4d8, 4.0, 0, 0);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);
    // Warm ambient so night sides read rather than going pitch black.
    scene.add(new THREE.AmbientLight(0x45506a, 0.55));

    // Texture loader with sRGB color space
    const texLoader = new THREE.TextureLoader();
    const loadedTextures: THREE.Texture[] = [];
    function loadTex(path: string, opts: { srgb?: boolean } = {}) {
      const tex = texLoader.load(path, () => {
        // Trigger a re-render as soon as the texture is available — without
        // this the planet can pop in a frame late and look stale.
        tex.needsUpdate = true;
      });
      tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      // Trilinear filtering + anisotropy — sharp up close, no shimmer at
      // oblique angles (visible on Saturn's rings and thin crescents).
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      loadedTextures.push(tex);
      return tex;
    }

    // ─── Sun ──────────────────────────────────────────────────────────────────
    const SUN_RADIUS = 40;
    const sunTex = loadTex('/textures/2k_sun.jpg');
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_RADIUS, 96, 96),
      new THREE.MeshBasicMaterial({ map: sunTex }),
    );
    scene.add(sunMesh);

    // Glow sprites (radial gradients) around the sun
    function makeGlowTexture(stops: Array<[number, string]>): THREE.CanvasTexture {
      const cvs = document.createElement('canvas');
      const SIZE = 1024;
      cvs.width = cvs.height = SIZE;
      const c = cvs.getContext('2d')!;
      const half = SIZE / 2;
      const g = c.createRadialGradient(half, half, 0, half, half, half);
      stops.forEach(([t, color]) => g.addColorStop(t, color));
      c.fillStyle = g;
      c.fillRect(0, 0, SIZE, SIZE);
      const t = new THREE.CanvasTexture(cvs);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      loadedTextures.push(t);
      return t;
    }

    const coronaTex = makeGlowTexture([
      [0.0,  'rgba(255,230,130,0.95)'],
      [0.2,  'rgba(255,180,60,0.55)'],
      [0.55, 'rgba(255,110,20,0.18)'],
      [1.0,  'rgba(255,80,0,0.0)'],
    ]);
    const haloTex = makeGlowTexture([
      [0.0, 'rgba(255,200,80,0.55)'],
      [0.4, 'rgba(255,120,30,0.16)'],
      [1.0, 'rgba(255,80,0,0.0)'],
    ]);

    // Corona — tight inner glow parented to the Sun. Small enough that it
    // never reaches any planet's orbit (Mercury is at 75), so normal depth
    // testing never causes it to overlap a planet.
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coronaTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    corona.scale.set(100, 100, 1);
    sunMesh.add(corona);

    // Outer halo — the big dramatic radiance. If we centered this on the Sun
    // at z=0, inner planets (Mercury/Venus/Earth) would orbit inside its
    // screen footprint while also crossing the Sun's depth plane, and the
    // depth test would flip the halo on/off over each planet twice per orbit
    // (the strobe the user was seeing). Instead we push the sprite ~700
    // units along the camera's view direction so its depth sits *behind*
    // every planet's orbit. With ortho projection this does not change its
    // screen position; the sprite still appears centered on the Sun, but the
    // depth test now reliably hides it behind any opaque surface (planets
    // and the Sun itself) and only reveals it in empty space — giving us
    // the big glow back without any strobing.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    halo.scale.set(440, 440, 1);
    const HALO_DEPTH_OFFSET = 700; // camera near=0.1 / far=4000; Neptune max depth ~1430
    const haloBackwardOffset = camera.position
      .clone()
      .negate()
      .normalize()
      .multiplyScalar(HALO_DEPTH_OFFSET);
    halo.position.copy(haloBackwardOffset);
    scene.add(halo);

    // Invisible hit sphere for Sun hover
    const sunHit = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_RADIUS * 1.25, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false, depthWrite: false }),
    );
    sunHit.userData = { name: 'Sun', info: 'G-type main sequence · 4.6 billion years' };
    sunMesh.add(sunHit);

    // ─── Planets ──────────────────────────────────────────────────────────────
    const PLANETS: PlanetDef[] = [
      { name: 'Mercury', info: '88 day orbit · Closest to the Sun',
        texture: '/textures/2k_mercury.jpg',
        size: 4, orbitR: 75, period: 5.1, offset: 0.8,
        tilt: THREE.MathUtils.degToRad(0.03), spin: 0.08 },

      { name: 'Venus', info: '225 day orbit · Hottest planet',
        texture: '/textures/2k_venus_atmosphere.jpg',
        size: 7, orbitR: 115, period: 12.9, offset: 2.1,
        tilt: THREE.MathUtils.degToRad(177), spin: -0.03 },

      { name: 'Earth', info: '365 day orbit · Our home',
        texture: '/textures/2k_earth_daymap.jpg',
        size: 9, orbitR: 160, period: 21.0, offset: 4.5,
        tilt: THREE.MathUtils.degToRad(23.4), spin: 0.14 },

      { name: 'Mars', info: '687 day orbit · The red planet',
        texture: '/textures/2k_mars.jpg',
        size: 6, orbitR: 210, period: 39.5, offset: 1.2,
        tilt: THREE.MathUtils.degToRad(25.2), spin: 0.18 },

      { name: 'Jupiter', info: '12 year orbit · Largest planet',
        texture: '/textures/2k_jupiter.jpg',
        size: 22, orbitR: 285, period: 125, offset: 3.7,
        tilt: THREE.MathUtils.degToRad(3.1), spin: 0.90 },

      { name: 'Saturn', info: '29 year orbit · Lord of the rings',
        texture: '/textures/2k_saturn.jpg',
        size: 18, orbitR: 350, period: 312, offset: 0.4,
        tilt: THREE.MathUtils.degToRad(26.7), spin: 0.82,
        hasRings: true },

      { name: 'Uranus', info: '84 year orbit · Tilted ice giant',
        texture: '/textures/2k_uranus.jpg',
        size: 12, orbitR: 395, period: 882, offset: 5.1,
        tilt: THREE.MathUtils.degToRad(97.8), spin: 0.45 },

      { name: 'Neptune', info: '165 year orbit · Farthest planet',
        texture: '/textures/2k_neptune.jpg',
        size: 11, orbitR: 435, period: 1725, offset: 2.8,
        tilt: THREE.MathUtils.degToRad(28.3), spin: 0.50 },
    ];

    const bodies: BodyRef[] = [];

    // Shared orbit line material (unlit, thin)
    const orbitMatBase = new THREE.LineBasicMaterial({
      color: 0xffebb4, transparent: true, opacity: 0.08, depthWrite: false,
    });
    const orbitMatHover = new THREE.LineBasicMaterial({
      color: 0xffebb4, transparent: true, opacity: 0.22, depthWrite: false,
    });

    function makeOrbitLine(radius: number): THREE.LineLoop {
      const segments = 256;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      return new THREE.LineLoop(geo, orbitMatBase);
    }

    function buildPlanet(def: PlanetDef): BodyRef {
      const orbitGroup = new THREE.Group();
      const tiltGroup  = new THREE.Group();
      tiltGroup.rotation.z = def.tilt;

      const tex = loadTex(def.texture);

      // Every planet uses the same PBR material so lighting is consistent.
      // Earth used to have a custom day/night shader + cloud sphere, but that
      // produced a hazy tint and a strobing day/night split at crescent
      // phase, so it now just uses the day texture like everyone else.
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 1,
        metalness: 0,
      });

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.size, 96, 96), mat);
      tiltGroup.add(mesh);

      // Saturn rings — use RingGeometry and remap UVs so the SSS ring strip
      // texture is sampled along the radial axis.
      if (def.hasRings) {
        const innerR = def.size * 1.25;
        const outerR = def.size * 2.30;
        const ringGeo = new THREE.RingGeometry(innerR, outerR, 256, 1);
        // Default RingGeometry is in the XY plane. We rotate it into XZ so
        // it lies in the planet's equatorial plane (tilted via tiltGroup).
        ringGeo.rotateX(-Math.PI / 2);
        // Remap UVs: radial position -> u, constant v.
        const pos = ringGeo.attributes.position;
        const uv  = ringGeo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          const r = Math.sqrt(x * x + z * z);
          const u = (r - innerR) / (outerR - innerR);
          uv.setXY(i, u, 0.5);
        }
        const ringTex = loadTex('/textures/2k_saturn_ring_alpha.png');
        const ringMat = new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          alphaMap: ringTex,
          side: THREE.DoubleSide,
          depthWrite: false,
          alphaTest: 0.02,
        });
        const rings = new THREE.Mesh(ringGeo, ringMat);
        tiltGroup.add(rings);
      }

      // Invisible larger hit mesh for easier hovering of small planets.
      const hitMesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(def.size * 1.8, def.size + 6), 16, 16),
        new THREE.MeshBasicMaterial({ visible: false, depthWrite: false }),
      );
      hitMesh.userData = { name: def.name, info: def.info };
      mesh.add(hitMesh);

      orbitGroup.add(tiltGroup);
      scene.add(orbitGroup);

      const orbitLine = makeOrbitLine(def.orbitR);
      scene.add(orbitLine);

      return {
        name: def.name, info: def.info,
        orbitGroup, tiltGroup, mesh, hitMesh,
        orbitLine, spin: def.spin,
      };
    }

    PLANETS.forEach(def => bodies.push(buildPlanet(def)));
    const earthBody = bodies.find(b => b.name === 'Earth')!;

    // ─── Moon (orbits Earth) ──────────────────────────────────────────────────
    const MOON_ORBIT_R = 18;
    const MOON_SIZE = 2.4;
    const moonOrbitGroup = new THREE.Group();
    const moonTiltGroup  = new THREE.Group();
    moonTiltGroup.rotation.z = THREE.MathUtils.degToRad(6.7);
    const moonTex = loadTex('/textures/2k_moon.jpg');
    const moonMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      roughness: 1,
      metalness: 0,
    });
    const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(MOON_SIZE, 64, 64), moonMat);
    moonTiltGroup.add(moonMesh);
    moonOrbitGroup.add(moonTiltGroup);
    earthBody.orbitGroup.add(moonOrbitGroup);

    const moonHit = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_SIZE * 3, 12, 12),
      new THREE.MeshBasicMaterial({ visible: false, depthWrite: false }),
    );
    moonHit.userData = { name: 'Moon', info: 'Blood moon tonight · 27.3 day orbit' };
    moonMesh.add(moonHit);

    // Moon orbit ring (dashed red-ish glow) around Earth.
    const moonOrbitPts: THREE.Vector3[] = [];
    const moonOrbitSegs = 96;
    for (let i = 0; i < moonOrbitSegs; i++) {
      const a = (i / moonOrbitSegs) * Math.PI * 2;
      moonOrbitPts.push(new THREE.Vector3(
        Math.cos(a) * MOON_ORBIT_R, 0, Math.sin(a) * MOON_ORBIT_R,
      ));
    }
    const moonOrbitGeo  = new THREE.BufferGeometry().setFromPoints(moonOrbitPts);
    const moonOrbitMat  = new THREE.LineBasicMaterial({
      color: 0xff6432, transparent: true, opacity: 0.22, depthWrite: false,
    });
    const moonOrbitLine = new THREE.LineLoop(moonOrbitGeo, moonOrbitMat);
    earthBody.orbitGroup.add(moonOrbitLine);

    // ─── Hover / raycasting ───────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitMeshes: THREE.Mesh[] = [
      sunHit,
      moonHit,
      ...bodies.map(b => b.hitMesh),
    ];

    let hoveredName: string | null = null;

    const tooltip = document.getElementById('planet-tooltip')!;
    const ttName  = document.getElementById('tt-name')!;
    const ttInfo  = document.getElementById('tt-info')!;

    function findBodyByName(name: string): BodyRef | null {
      return bodies.find(b => b.name === name) ?? null;
    }

    function setHoverState(name: string | null) {
      if (hoveredName === name) return;
      // Reset previous orbit line to base material
      if (hoveredName) {
        const prev = findBodyByName(hoveredName);
        if (prev?.orbitLine) prev.orbitLine.material = orbitMatBase;
      }
      hoveredName = name;
      if (name) {
        const cur = findBodyByName(name);
        if (cur?.orbitLine) cur.orbitLine.material = orbitMatHover;
      }
    }

    function onMouseMove(e: MouseEvent) {
      const rect = oc.getBoundingClientRect();
      ndc.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      ndc.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);

      let foundName: string | null = null;
      let foundInfo: string | null = null;
      if (hits.length > 0) {
        const hit = hits[0].object;
        foundName = (hit.userData.name as string) ?? null;
        foundInfo = (hit.userData.info as string) ?? null;
      }

      setHoverState(foundName);

      if (foundName && foundInfo) {
        oc.style.cursor = 'crosshair';
        ttName.textContent = foundName;
        ttInfo.textContent = foundInfo;
        tooltip.classList.add('visible');
        tooltip.style.left      = `${e.clientX + 16}px`;
        tooltip.style.top       = `${e.clientY}px`;
        tooltip.style.transform = 'translateY(-50%)';
      } else {
        oc.style.cursor = 'default';
        tooltip.classList.remove('visible');
      }
    }

    function onMouseLeave() {
      setHoverState(null);
      oc.style.cursor = 'default';
      tooltip.classList.remove('visible');
    }

    oc.addEventListener('mousemove', onMouseMove);
    oc.addEventListener('mouseleave', onMouseLeave);

    // ─── Render loop ──────────────────────────────────────────────────────────
    let rafId: number;
    const clock = new THREE.Clock();

    function bodyAngle(period: number, offset: number, t: number) {
      return offset + (t / period) * Math.PI * 2;
    }

    function frame() {
      const ts = performance.now();
      const t  = ts * 0.001;
      const dt = clock.getDelta();

      drawBg(ts);

      // Sun rotation & glow pulse
      sunMesh.rotation.y += dt * 0.05;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.5);
      corona.scale.setScalar(100 + pulse * 8);
      halo.scale.setScalar(440 + pulse * 40);

      // Update planet positions, rotation, and shader uniforms.
      bodies.forEach(b => {
        const def = PLANETS.find(p => p.name === b.name)!;
        const a = bodyAngle(def.period, def.offset, t);
        b.orbitGroup.position.set(
          Math.cos(a) * def.orbitR, 0, Math.sin(a) * def.orbitR,
        );
        b.mesh.rotation.y += dt * b.spin;

      });

      // Moon orbit around Earth.
      const moonA = bodyAngle(0.72, 1.3, t);
      moonOrbitGroup.position.set(
        Math.cos(moonA) * MOON_ORBIT_R, 0, Math.sin(moonA) * MOON_ORBIT_R,
      );
      moonMesh.rotation.y += dt * 0.08;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(frame);
    }

    // ─── Resize ───────────────────────────────────────────────────────────────
    function onResize() {
      initBg();
      sizeRenderer();
    }

    // ─── Countdown ────────────────────────────────────────────────────────────
    let total = 2 * 3600 + 18 * 60;
    const countEl = document.getElementById('countdown')!;
    const countInterval = setInterval(() => {
      if (total <= 0) return;
      total--;
      const h = String(Math.floor(total / 3600)).padStart(2, '0');
      const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
      countEl.textContent = `${h}:${m}`;
    }, 1000);

    // ─── Boot ─────────────────────────────────────────────────────────────────
    initBg();
    window.addEventListener('resize', onResize);
    rafId = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafId);
      clearInterval(countInterval);
      oc.removeEventListener('mousemove', onMouseMove);
      oc.removeEventListener('mouseleave', onMouseLeave);

      loadedTextures.forEach(t => t.dispose());
      scene.traverse(obj => {
        const anyObj = obj as unknown as {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        if (anyObj.geometry) anyObj.geometry.dispose();
        if (anyObj.material) {
          if (Array.isArray(anyObj.material)) {
            anyObj.material.forEach(m => m.dispose());
          } else {
            anyObj.material.dispose();
          }
        }
      });
      orbitMatBase.dispose();
      orbitMatHover.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <>
      <canvas id="bg" />
      <canvas id="orrery-canvas" />

      <div className="scene">
        <div className="info-left fade-in-2">
          <div className="eyebrow">Tonight · Sydney</div>
          <div className="event-name-big">
            Blood<br /><em>Moon</em>
          </div>
          <p className="desc">
            Earth&apos;s shadow engulfs the Moon.<br />
            Deep crimson. Total eclipse.
          </p>
          <div className="time-block">
            <div className="time-value" id="countdown">02:18</div>
            <div className="time-label">Until totality</div>
          </div>
          <div className="divider-short" />
        </div>

        <div className="info-right fade-in-3">
          <div className="eyebrow">Where to look</div>
          <div className="direction-data">
            <div className="dir-value">ESE</div>
            <div className="dir-label">Direction</div>
          </div>
          <div className="direction-data">
            <div className="dir-value">102°</div>
            <div className="dir-label">Azimuth</div>
          </div>
          <div className="direction-data">
            <div className="dir-value">8°</div>
            <div className="dir-label">Altitude</div>
          </div>
          <div className="score-ring-wrap">
            <div className="score-ring">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,235,180,0.07)" strokeWidth="2" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="#ff6633" strokeWidth="2"
                  strokeDasharray="213.6" strokeDashoffset="19.2" strokeLinecap="round" />
              </svg>
              <div className="score-ring-num">91</div>
            </div>
            <div className="score-ring-label">Cool score</div>
          </div>
        </div>
      </div>

      <div className="place-bottom fade-in-3">
        <div className="place-pill">
          <span className="place-pill-name">Observatory Hill</span>
          <div className="place-pill-sep" />
          <span className="place-pill-detail">0.4 km · Face ESE · Clear horizon</span>
        </div>
        <button className="go-btn">Navigate →</button>
      </div>

      <div id="planet-tooltip">
        <div className="tt-name" id="tt-name" />
        <div className="tt-info" id="tt-info" />
      </div>
    </>
  );
}
