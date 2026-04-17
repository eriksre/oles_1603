'use client';

import { useEffect } from 'react';
import * as THREE from 'three';

interface Star {
  x: number;
  y: number;
  r: number;           // core radius (CSS px)
  baseA: number;       // baseline alpha
  twinkleAmp: number;  // twinkle amplitude (0 = still)
  freq1: number;       // primary twinkle frequency
  freq2: number;       // secondary (adds irregularity)
  phase: number;
  color: string;       // "r,g,b" triple
  glowR: number;       // soft halo radius; 0 = none
  spike: number;       // diffraction spike length; 0 = none
}
interface Nebula {
  x: number; y: number; rx: number; ry: number; c: string;
}

// Curated stellar color palette, skewed toward warm/neutral (our warm text
// palette) with a handful of cool blue-white sprinkled in. Real stars span
// a much wider gamut, but a tight curated set reads as intentional rather
// than noisy.
const STAR_COLORS = [
  '255,245,220', // neutral
  '255,240,210',
  '255,235,180', // warm (matches the UI accent)
  '255,230,170',
  '255,220,140', // amber giant
  '255,205,120',
  '255,180,120', // orange K-type
  '220,225,255', // cool blue-white
  '200,215,255',
  '255,255,245', // near-white
];

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

      // Three layers of stars so the sky reads with depth rather than as a
      // uniform field of pulsing dots:
      //   dust    — tiny, very dim, practically still. The visual "grain".
      //   mid     — main star count, slow irregular twinkle.
      //   hero    — rare bright standouts with a soft halo and very rare
      //             diffraction spikes. Drives the eye.
      //
      // Counts scale with viewport area so phones don't feel empty and huge
      // displays don't feel noisy.
      const area = bgW * bgH;
      const dustCount = Math.round(Math.min(1200, Math.max(400, area / 3500)));
      const midCount  = Math.round(Math.min(600,  Math.max(180, area / 7000)));
      const heroCount = Math.round(Math.min(40,   Math.max(12,  area / 90000)));

      const rand = () => Math.random();
      // Power-law size: most stars small, a few noticeably larger. The
      // exponent controls the skew; higher = more small stars.
      const powSize = (min: number, max: number, skew = 2.5) =>
        min + (max - min) * Math.pow(rand(), skew);

      const pickColor = (warmBias: number) =>
        STAR_COLORS[
          Math.min(
            STAR_COLORS.length - 1,
            Math.floor(Math.pow(rand(), warmBias) * STAR_COLORS.length),
          )
        ];

      stars = [];

      for (let i = 0; i < dustCount; i++) {
        stars.push({
          x: rand() * bgW,
          y: rand() * bgH,
          r: 0.35 + rand() * 0.45,
          baseA: 0.18 + rand() * 0.22,
          twinkleAmp: rand() * 0.08, // barely breathes
          freq1: 0.2 + rand() * 0.4,
          freq2: 0.15 + rand() * 0.3,
          phase: rand() * Math.PI * 2,
          color: pickColor(1.2),
          glowR: 0,
          spike: 0,
        });
      }

      for (let i = 0; i < midCount; i++) {
        // Prefer warm stars (bias toward start of palette) — matches the
        // rest of the UI's warm accent temperature.
        const r = powSize(0.55, 1.6, 2.2);
        stars.push({
          x: rand() * bgW,
          y: rand() * bgH,
          r,
          baseA: 0.35 + rand() * 0.35,
          twinkleAmp: 0.12 + rand() * 0.28,
          // Each star picks its own primary/secondary twinkle frequencies
          // from a non-commensurate range — the beats between them break
          // the "everything breathing in sync" look of a single sine.
          freq1: 0.35 + rand() * 1.8,
          freq2: 0.25 + rand() * 1.1,
          phase: rand() * Math.PI * 2,
          color: pickColor(1.4),
          glowR: r * (1.5 + rand() * 1.5),
          spike: 0,
        });
      }

      for (let i = 0; i < heroCount; i++) {
        const r = 1.4 + rand() * 1.3;
        stars.push({
          x: rand() * bgW,
          y: rand() * bgH,
          r,
          baseA: 0.65 + rand() * 0.3,
          twinkleAmp: 0.18 + rand() * 0.3,
          freq1: 0.25 + rand() * 1.0,
          freq2: 0.2 + rand() * 0.8,
          phase: rand() * Math.PI * 2,
          color: pickColor(0.9),      // broader color spread for heroes
          glowR: r * (4 + rand() * 3),
          // Only ~35% of heroes get diffraction spikes — otherwise the
          // field feels too "lens-flare-y".
          spike: rand() < 0.35 ? r * (5 + rand() * 5) : 0,
        });
      }

      nebulae = [
        { x: bgW * 0.22, y: bgH * 0.28, rx: 380, ry: 240, c: 'rgba(80,20,130,0.07)' },
        { x: bgW * 0.78, y: bgH * 0.72, rx: 300, ry: 400, c: 'rgba(140,40,20,0.055)' },
        { x: bgW * 0.60, y: bgH * 0.18, rx: 220, ry: 200, c: 'rgba(20,55,130,0.045)' },
      ];
    }

    function drawBg(ts: number) {
      const t = ts * 0.001;
      bgCtx.clearRect(0, 0, bgW, bgH);

      // Nebulae first (underneath everything).
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

      // Stars — additive so overlapping glows brighten rather than occlude.
      bgCtx.save();
      bgCtx.globalCompositeOperation = 'lighter';
      stars.forEach(s => {
        // Two non-harmonic sines summed give a twinkle that never quite
        // repeats; clamp keeps it always bright-ish (stars don't fully
        // "turn off" in real life).
        const tw = 0.6 * Math.sin(t * s.freq1 + s.phase)
                 + 0.4 * Math.sin(t * s.freq2 + s.phase * 1.7);
        const a = Math.max(0.05, s.baseA + s.twinkleAmp * tw);

        // Optional soft halo for mid/hero stars.
        if (s.glowR > 0) {
          const haloA = Math.min(0.35, a * 0.35);
          const hg = bgCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.glowR);
          hg.addColorStop(0, `rgba(${s.color},${haloA})`);
          hg.addColorStop(1, `rgba(${s.color},0)`);
          bgCtx.fillStyle = hg;
          bgCtx.beginPath();
          bgCtx.arc(s.x, s.y, s.glowR, 0, Math.PI * 2);
          bgCtx.fill();
        }

        // Diffraction spikes on a small subset of hero stars.
        if (s.spike > 0) {
          const sa = Math.min(0.45, a * 0.55);
          bgCtx.strokeStyle = `rgba(${s.color},${sa})`;
          bgCtx.lineWidth = 0.6;
          bgCtx.beginPath();
          bgCtx.moveTo(s.x - s.spike, s.y);
          bgCtx.lineTo(s.x + s.spike, s.y);
          bgCtx.moveTo(s.x, s.y - s.spike);
          bgCtx.lineTo(s.x, s.y + s.spike);
          bgCtx.stroke();
        }

        // Core.
        bgCtx.beginPath();
        bgCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        bgCtx.fillStyle = `rgba(${s.color},${a})`;
        bgCtx.fill();
      });
      bgCtx.restore();
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
    // User explicitly asked for the 8k sun. Note: Solar System Scope labels
    // their highest-res sun as "8k" but it's actually 4096×2048. It's still
    // 4× the area of the previous 2k map so surface granulation reads
    // clearly on retina displays.
    const sunTex = loadTex('/textures/8k_sun.jpg');
    const sunMesh = new THREE.Mesh(
      // Higher tessellation so the silhouette stays round on hi-DPI phones.
      new THREE.SphereGeometry(SUN_RADIUS, 128, 128),
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
    // An extra cooler, softer outer bloom that layers under the warm halo
    // and breathes at its own slow cadence. Gives the glow a dual-tone
    // warm-core / cool-outer feel closer to real solar photographs.
    const bloomTex = makeGlowTexture([
      [0.0, 'rgba(255,200,120,0.22)'],
      [0.35, 'rgba(255,140,80,0.09)'],
      [0.75, 'rgba(255,110,60,0.03)'],
      [1.0,  'rgba(180,100,60,0.0)'],
    ]);

    // Corona — tight inner glow parented to the Sun. Small enough that it
    // never reaches any planet's orbit (Mercury is at 75), so normal depth
    // testing never causes it to overlap a planet.
    const CORONA_BASE = 104;
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coronaTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 1.0,
    }));
    corona.scale.set(CORONA_BASE, CORONA_BASE, 1);
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
    const HALO_BASE = 460;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 1.0,
    }));
    halo.scale.set(HALO_BASE, HALO_BASE, 1);
    const HALO_DEPTH_OFFSET = 700; // camera near=0.1 / far=4000; Neptune max depth ~1430
    const haloBackwardOffset = camera.position
      .clone()
      .negate()
      .normalize()
      .multiplyScalar(HALO_DEPTH_OFFSET);
    halo.position.copy(haloBackwardOffset);
    scene.add(halo);

    // Outer bloom sits slightly further behind — it's the very soft wash
    // that fades into the space around the Sun.
    const BLOOM_BASE = 720;
    const bloom = new THREE.Sprite(new THREE.SpriteMaterial({
      map: bloomTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.9,
    }));
    bloom.scale.set(BLOOM_BASE, BLOOM_BASE, 1);
    const bloomBackwardOffset = camera.position
      .clone()
      .negate()
      .normalize()
      .multiplyScalar(HALO_DEPTH_OFFSET + 60);
    bloom.position.copy(bloomBackwardOffset);
    scene.add(bloom);

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
        texture: '/textures/4k_mercury.jpg',
        size: 4, orbitR: 75, period: 5.1, offset: 0.8,
        tilt: THREE.MathUtils.degToRad(0.03), spin: 0.08 },

      { name: 'Venus', info: '225 day orbit · Hottest planet',
        texture: '/textures/4k_venus_surface.jpg',
        size: 7, orbitR: 115, period: 12.9, offset: 2.1,
        tilt: THREE.MathUtils.degToRad(177), spin: -0.03 },

      { name: 'Earth', info: '365 day orbit · Our home',
        texture: '/textures/4k_earth_daymap.jpg',
        size: 9, orbitR: 160, period: 21.0, offset: 4.5,
        tilt: THREE.MathUtils.degToRad(23.4), spin: 0.14 },

      { name: 'Mars', info: '687 day orbit · The red planet',
        texture: '/textures/4k_mars.jpg',
        size: 6, orbitR: 210, period: 39.5, offset: 1.2,
        tilt: THREE.MathUtils.degToRad(25.2), spin: 0.18 },

      { name: 'Jupiter', info: '12 year orbit · Largest planet',
        texture: '/textures/4k_jupiter.jpg',
        size: 22, orbitR: 285, period: 125, offset: 3.7,
        tilt: THREE.MathUtils.degToRad(3.1), spin: 0.90 },

      { name: 'Saturn', info: '29 year orbit · Lord of the rings',
        texture: '/textures/4k_saturn.jpg',
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
        const ringTex = loadTex('/textures/8k_saturn_ring_alpha.png');
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
    const moonTex = loadTex('/textures/4k_moon.jpg');
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

      // Sun rotation & glow pulse — replaced the old single-sine pulse with
      // three non-commensurate sines per layer so the result never quite
      // repeats and reads as organic "breathing" rather than a metronome.
      // Each layer uses its own seed phase + slightly different frequency
      // set so corona / halo / bloom don't stay in phase with each other.
      sunMesh.rotation.y += dt * 0.05;

      // Corona: fastest-moving, tightest amplitude. Sits right at the
      // limb of the sun and tracks the "shimmer" of surface activity.
      const coronaPulse =
          0.55 * Math.sin(t * 0.42 + 1.3)
        + 0.30 * Math.sin(t * 0.97 + 2.4)
        + 0.15 * Math.sin(t * 1.83 + 0.7);
      corona.scale.setScalar(CORONA_BASE + coronaPulse * 6);
      corona.material.opacity = 0.92 + coronaPulse * 0.05;

      // Halo: medium cadence, slightly larger amplitude, offset phase so
      // it doesn't expand/contract in lockstep with the corona.
      const haloPulse =
          0.50 * Math.sin(t * 0.27 + 0.4)
        + 0.30 * Math.sin(t * 0.61 + 3.1)
        + 0.20 * Math.sin(t * 1.11 + 5.2);
      halo.scale.setScalar(HALO_BASE + haloPulse * 26);
      halo.material.opacity = 0.95 + haloPulse * 0.04;

      // Outer bloom: slowest, broadest — the "atmosphere" of the glow. Its
      // amplitude is larger in absolute terms but proportionally small
      // (~3% of its base scale) so it stays subtle.
      const bloomPulse =
          0.55 * Math.sin(t * 0.13 + 2.7)
        + 0.30 * Math.sin(t * 0.33 + 0.9)
        + 0.15 * Math.sin(t * 0.71 + 4.1);
      bloom.scale.setScalar(BLOOM_BASE + bloomPulse * 34);
      bloom.material.opacity = 0.85 + bloomPulse * 0.08;

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
