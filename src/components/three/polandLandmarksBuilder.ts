import * as THREE from 'three';

export interface WorldXZ {
  readonly x: number;
  readonly z: number;
}

export function latLngToWorldXZ(lat: number, lng: number): WorldXZ {
  const centerLat = 51.95;
  const centerLng = 19.15;
  return {
    x: (lng - centerLng) * 1.15,
    z: -(lat - centerLat) * 1.62,
  };
}

export interface PolishLandmarksRig {
  readonly group: THREE.Group;
  readonly rotatingElements: readonly THREE.Object3D[];
  readonly lighthouseBeam: THREE.Object3D | null;
  dispose(): void;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, 'rgba(2, 6, 12, 0.72)');
    grad.addColorStop(0.55, 'rgba(2, 6, 12, 0.28)');
    grad.addColorStop(1, 'rgba(2, 6, 12, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTopographicBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle elevation contour bands + micro relief grain
    for (let i = 0; i < 16; i += 1) {
      const r = 30 + i * 28;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(215, 215, 215, 0.22)' : 'rgba(55, 55, 55, 0.2)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(260 + Math.sin(i) * 24, 280 + Math.cos(i) * 18, r, r * 0.72, i * 0.14, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let y = 0; y < 512; y += 8) {
      for (let x = 0; x < 512; x += 8) {
        const n = Math.sin(x * 0.09) * Math.cos(y * 0.08) * 14;
        const v = Math.max(0, Math.min(255, Math.round(128 + n)));
        ctx.fillStyle = `rgba(${v},${v},${v},0.16)`;
        ctx.fillRect(x, y, 8, 8);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  // Data map stays in Linear (NoColorSpace) for accurate bump/roughness response
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

function addContactShadow(
  parent: THREE.Group,
  radius: number,
  geoList: THREE.BufferGeometry[],
  shadowMat: THREE.MeshBasicMaterial,
): void {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geoList.push(geo);
  const mesh = new THREE.Mesh(geo, shadowMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.008;
  parent.add(mesh);
}

/**
 * Builds 6 composite architectural landmarks (Warszawa, Kraków, Gdańsk, Malbork, Hel, Tatry/Zakopane)
 * plus InstancedMesh conifer clusters, all grounded flush on the Poland plateau (`plateauY`).
 */
export function buildPolishLandmarksRig(
  plateauY: number,
  enableShadows: boolean,
): PolishLandmarksRig {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const rotatingElements: THREE.Object3D[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const shadowTex = createContactShadowTexture();
  textures.push(shadowTex);
  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    }),
  );

  // Varied PBR material palette (stone, brick, aged copper, dark timber, brushed gold, snow, alpine rock)
  const limestoneMat = trackMat(
    new THREE.MeshStandardMaterial({color: 0xd9d2c3, roughness: 0.72, metalness: 0.06}),
  );
  const brickMat = trackMat(
    new THREE.MeshStandardMaterial({color: 0xa44a38, roughness: 0.82, metalness: 0.05}),
  );
  const darkBrickMat = trackMat(
    new THREE.MeshStandardMaterial({color: 0x7c3629, roughness: 0.86, metalness: 0.05}),
  );
  const timberMat = trackMat(
    new THREE.MeshStandardMaterial({color: 0x4b3526, roughness: 0.88, metalness: 0.04}),
  );
  const copperMat = trackMat(
    new THREE.MeshStandardMaterial({color: 0x2f8f7b, roughness: 0.36, metalness: 0.68}),
  );
  const goldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf5b841,
      emissive: 0x925e09,
      emissiveIntensity: 0.35,
      roughness: 0.22,
      metalness: 0.88,
    }),
  );
  const lanternGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff3c4,
      emissive: 0xfbbf24,
      emissiveIntensity: 1.4,
      roughness: 0.12,
      metalness: 0.1,
    }),
  );
  const beamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const alpineRockMat = trackMat(
    new THREE.MeshStandardMaterial({color: 0x2c3f54, roughness: 0.86, metalness: 0.1}),
  );
  const snowCapMat = trackMat(
    new THREE.MeshStandardMaterial({color: 0xe6eff7, roughness: 0.65, metalness: 0.04}),
  );
  const emeraldRingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 0.5,
      roughness: 0.25,
      metalness: 0.72,
    }),
  );

  const configureShadow = (mesh: THREE.Mesh) => {
    mesh.castShadow = enableShadows;
    mesh.receiveShadow = enableShadows;
    return mesh;
  };

  // 1. WARSZAWA — Stepped Palace Spire (8 composite parts)
  {
    const {x, z} = latLngToWorldXZ(52.23, 21.01);
    const warsaw = new THREE.Group();
    warsaw.position.set(x, plateauY, z);
    addContactShadow(warsaw, 0.56, geometries, contactShadowMat);

    const plinth = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.14, 0.62)), limestoneMat));
    plinth.position.y = 0.07;
    warsaw.add(plinth);

    const lowerBody = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.36, 0.36)), limestoneMat));
    lowerBody.position.y = 0.32;
    warsaw.add(lowerBody);

    // 4 corner stepped pavilions
    const wingGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.24, 0.14));
    const offsets = [
      [-0.22, -0.22],
      [0.22, -0.22],
      [-0.22, 0.22],
      [0.22, 0.22],
    ] as const;
    for (const [ox, oz] of offsets) {
      const wing = configureShadow(new THREE.Mesh(wingGeo, limestoneMat));
      wing.position.set(ox, 0.22, oz);
      warsaw.add(wing);
    }

    const upperShaft = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.34, 0.22)), limestoneMat));
    upperShaft.position.y = 0.66;
    warsaw.add(upperShaft);

    const clockTier = configureShadow(new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.09, 0.12, 0.16, 8)), copperMat));
    clockTier.position.y = 0.9;
    warsaw.add(clockTier);

    const spire = configureShadow(new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.045, 0.36, 8)), goldMat));
    spire.position.y = 1.15;
    warsaw.add(spire);

    const halo = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.36, 0.015, 8, 28)), emeraldRingMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.03;
    warsaw.add(halo);

    group.add(warsaw);
  }

  // 2. KRAKÓW — Bazylika Mariacka (brick nave + asymmetric twin towers, 7 parts)
  {
    const {x, z} = latLngToWorldXZ(50.06, 19.94);
    const krakow = new THREE.Group();
    krakow.position.set(x, plateauY, z);
    addContactShadow(krakow, 0.5, geometries, contactShadowMat);

    const nave = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.24, 0.28)), brickMat));
    nave.position.set(0, 0.12, 0.04);
    krakow.add(nave);

    const naveRoof = configureShadow(new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.28, 0.16, 4)), copperMat));
    naveRoof.position.set(0, 0.31, 0.04);
    naveRoof.rotation.y = Math.PI / 4;
    krakow.add(naveRoof);

    // Taller Hejnałowa tower (left)
    const tallTower = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.58, 0.14)), brickMat));
    tallTower.position.set(-0.14, 0.29, -0.09);
    krakow.add(tallTower);

    const tallSpire = configureShadow(new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.095, 0.34, 8)), copperMat));
    tallSpire.position.set(-0.14, 0.74, -0.09);
    krakow.add(tallSpire);

    const goldenCrown = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.065, 0.014, 8, 16)), goldMat);
    goldenCrown.rotation.x = Math.PI / 2;
    goldenCrown.position.set(-0.14, 0.67, -0.09);
    krakow.add(goldenCrown);

    // Shorter belfry tower (right)
    const shortTower = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.44, 0.14)), darkBrickMat));
    shortTower.position.set(0.14, 0.22, -0.09);
    krakow.add(shortTower);

    const shortDome = configureShadow(new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.085, 12, 8)), copperMat));
    shortDome.position.set(0.14, 0.46, -0.09);
    krakow.add(shortDome);

    group.add(krakow);
  }

  // 3. GDAŃSK — Żuraw Gdański (twin cylindrical brick towers + timber crane overhang, 6 parts)
  {
    const {x, z} = latLngToWorldXZ(54.35, 18.66);
    const gdansk = new THREE.Group();
    gdansk.position.set(x, plateauY, z);
    gdansk.rotation.y = 0.25;
    addContactShadow(gdansk, 0.48, geometries, contactShadowMat);

    const towerGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.125, 0.44, 14));
    const leftCyl = configureShadow(new THREE.Mesh(towerGeo, brickMat));
    leftCyl.position.set(-0.15, 0.22, 0);
    gdansk.add(leftCyl);

    const rightCyl = configureShadow(new THREE.Mesh(towerGeo, brickMat));
    rightCyl.position.set(0.15, 0.22, 0);
    gdansk.add(rightCyl);

    const capGeo = trackGeo(new THREE.ConeGeometry(0.125, 0.18, 14));
    const leftCap = configureShadow(new THREE.Mesh(capGeo, darkBrickMat));
    leftCap.position.set(-0.15, 0.53, 0);
    gdansk.add(leftCap);

    const rightCap = configureShadow(new THREE.Mesh(capGeo, darkBrickMat));
    rightCap.position.set(0.15, 0.53, 0);
    gdansk.add(rightCap);

    // Timber crane housing suspended between towers
    const craneBody = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.34, 0.3)), timberMat));
    craneBody.position.set(0, 0.42, 0.08);
    gdansk.add(craneBody);

    const craneRoof = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.08, 0.36)), copperMat));
    craneRoof.position.set(0, 0.62, 0.08);
    gdansk.add(craneRoof);

    group.add(gdansk);
  }

  // 4. MALBORK — Teutonic Brick Fortress Keep + 4 Turrets (7 parts)
  {
    const {x, z} = latLngToWorldXZ(54.04, 19.03);
    const malbork = new THREE.Group();
    malbork.position.set(x, plateauY, z);
    addContactShadow(malbork, 0.48, geometries, contactShadowMat);

    const walls = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.2, 0.42)), brickMat));
    walls.position.y = 0.1;
    malbork.add(walls);

    const keep = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.2, 0.52, 0.2)), darkBrickMat));
    keep.position.set(0, 0.26, -0.02);
    malbork.add(keep);

    const keepRoof = configureShadow(new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.16, 0.2, 4)), copperMat));
    keepRoof.position.set(0, 0.61, -0.02);
    keepRoof.rotation.y = Math.PI / 4;
    malbork.add(keepRoof);

    const turretGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.055, 0.32, 10));
    const corners = [
      [-0.21, -0.19],
      [0.21, -0.19],
      [-0.21, 0.19],
      [0.21, 0.19],
    ] as const;
    for (const [cx, cz] of corners) {
      const turret = configureShadow(new THREE.Mesh(turretGeo, brickMat));
      turret.position.set(cx, 0.16, cz);
      malbork.add(turret);
    }

    group.add(malbork);
  }

  // 5. HEL — Octagonal Coastal Lighthouse + Rotating Golden Beam (6 parts)
  let lighthouseBeam: THREE.Object3D | null = null;
  {
    const {x, z} = latLngToWorldXZ(54.61, 18.81);
    const hel = new THREE.Group();
    hel.position.set(x, plateauY, z);
    addContactShadow(hel, 0.32, geometries, contactShadowMat);

    const base = configureShadow(new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 0.08, 8)), limestoneMat));
    base.position.y = 0.04;
    hel.add(base);

    const shaft = configureShadow(new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.125, 0.58, 8)), brickMat));
    shaft.position.y = 0.36;
    hel.add(shaft);

    const gallery = configureShadow(new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.115, 0.095, 0.05, 12)), limestoneMat));
    gallery.position.y = 0.67;
    hel.add(gallery);

    const lantern = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.072, 0.072, 0.12, 12)), lanternGlassMat);
    lantern.position.y = 0.75;
    hel.add(lantern);

    const cap = configureShadow(new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.09, 0.12, 12)), copperMat));
    cap.position.y = 0.87;
    hel.add(cap);

    // Rotating light beam pivot
    const beamPivot = new THREE.Group();
    beamPivot.position.y = 0.75;
    const beamConeGeo = trackGeo(new THREE.ConeGeometry(0.28, 1.55, 16, 1, true));
    beamConeGeo.rotateZ(-Math.PI / 2);
    beamConeGeo.translate(0.78, 0, 0);
    const beamMesh = new THREE.Mesh(beamConeGeo, beamMat);
    beamPivot.add(beamMesh);
    hel.add(beamPivot);
    lighthouseBeam = beamPivot;

    group.add(hel);
  }

  // 6. TATRY & ZAKOPANE — Composite Snow-Capped Alpine Peaks + Podhale Gable Roof (9 parts)
  {
    const {x, z} = latLngToWorldXZ(49.26, 19.96);
    const tatry = new THREE.Group();
    tatry.position.set(x, plateauY, z);

    const peaks = [
      {dx: 0, dz: 0, r: 0.78, h: 1.15, snow: true},
      {dx: -0.58, dz: -0.06, r: 0.56, h: 0.84, snow: true},
      {dx: 0.62, dz: -0.1, r: 0.58, h: 0.78, snow: true},
      {dx: 0.24, dz: -0.34, r: 0.42, h: 0.58, snow: false},
    ] as const;

    for (const p of peaks) {
      const rockGeo = trackGeo(new THREE.ConeGeometry(p.r, p.h, 6));
      const rock = configureShadow(new THREE.Mesh(rockGeo, alpineRockMat));
      rock.position.set(p.dx, p.h / 2 - 0.04, p.dz);
      rock.rotation.y = p.dx * 2.1 + 0.5;
      tatry.add(rock);

      if (p.snow) {
        const capH = p.h * 0.34;
        const capR = p.r * 0.35;
        const snowGeo = trackGeo(new THREE.ConeGeometry(capR, capH, 6));
        const snow = configureShadow(new THREE.Mesh(snowGeo, snowCapMat));
        snow.position.set(p.dx, p.h - capH / 2 - 0.035, p.dz);
        snow.rotation.y = rock.rotation.y;
        tatry.add(snow);
      }
    }

    // Podhale wooden chalet silhouette in Zakopane valley
    const chaletBase = configureShadow(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.12, 0.18)), timberMat));
    chaletBase.position.set(-0.08, 0.06, -0.52);
    tatry.add(chaletBase);

    const chaletRoof = configureShadow(new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.21, 0.2, 4)), darkBrickMat));
    chaletRoof.position.set(-0.08, 0.22, -0.52);
    chaletRoof.rotation.y = Math.PI / 4;
    tatry.add(chaletRoof);

    group.add(tatry);
  }

  // Secondary western & eastern mountain ridges (Karkonosze & Bieszczady)
  const extraRidges: readonly {lat: number; lng: number; r: number; h: number}[] = [
    {lat: 50.74, lng: 15.74, r: 0.68, h: 0.72},
    {lat: 50.35, lng: 16.75, r: 0.56, h: 0.52},
    {lat: 49.28, lng: 22.45, r: 0.76, h: 0.66},
    {lat: 49.62, lng: 19.15, r: 0.58, h: 0.52},
  ];
  for (const ridge of extraRidges) {
    const {x, z} = latLngToWorldXZ(ridge.lat, ridge.lng);
    const geo = trackGeo(new THREE.ConeGeometry(ridge.r, ridge.h, 6));
    const mesh = configureShadow(new THREE.Mesh(geo, alpineRockMat));
    mesh.position.set(x, plateauY + ridge.h / 2 - 0.04, z);
    mesh.rotation.y = ridge.lng;
    group.add(mesh);
  }

  // InstancedMesh forest clusters (Mazury, Bory Tucholskie, Puszcza Białowieska, Beskidy)
  const pinePositions: readonly [number, number][] = [
    [53.78, 21.65], [53.65, 21.4], [53.9, 21.8], [53.72, 22.1], [53.55, 21.2],
    [53.8, 17.85], [53.72, 18.05], [53.6, 17.75], [53.9, 18.1],
    [52.7, 23.8], [52.62, 23.65], [52.8, 23.7], [52.52, 23.55],
    [49.55, 21.8], [49.45, 22.15], [49.68, 21.4], [49.75, 20.6],
    [51.45, 16.1], [51.6, 15.8], [52.25, 15.65], [52.4, 15.35],
    [50.9, 20.7], [50.82, 20.95], [51.05, 20.55],
  ];
  const pineGeo = trackGeo(new THREE.ConeGeometry(0.095, 0.28, 6));
  const pineMat = trackMat(
    new THREE.MeshStandardMaterial({color: 0x164e3f, roughness: 0.88, metalness: 0.04}),
  );
  const pineInstances = new THREE.InstancedMesh(pineGeo, pineMat, pinePositions.length);
  pineInstances.castShadow = enableShadows;
  pineInstances.receiveShadow = enableShadows;
  const dummy = new THREE.Object3D();
  pinePositions.forEach(([lat, lng], idx) => {
    const {x, z} = latLngToWorldXZ(lat, lng);
    const scale = 0.78 + ((idx * 37) % 10) * 0.055;
    dummy.position.set(x, plateauY + 0.13 * scale, z);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.y = idx * 0.9;
    dummy.updateMatrix();
    pineInstances.setMatrixAt(idx, dummy.matrix);
  });
  pineInstances.instanceMatrix.needsUpdate = true;
  group.add(pineInstances);

  // Subtle floating emerald markers on Wrocław, Poznań, Zamość, Szczecin
  const minorCities: readonly [number, number][] = [
    [51.11, 17.03],
    [52.41, 16.93],
    [50.72, 23.25],
    [53.43, 14.57],
  ];
  const pinStemGeo = trackGeo(new THREE.CylinderGeometry(0.025, 0.04, 0.42, 10));
  const pinHeadGeo = trackGeo(new THREE.OctahedronGeometry(0.11, 0));
  const stemMat = trackMat(new THREE.MeshStandardMaterial({color: 0x94a3b8, roughness: 0.28, metalness: 0.85}));

  for (const [lat, lng] of minorCities) {
    const {x, z} = latLngToWorldXZ(lat, lng);
    const marker = new THREE.Group();
    marker.position.set(x, plateauY, z);

    const stem = configureShadow(new THREE.Mesh(pinStemGeo, stemMat));
    stem.position.y = 0.21;
    marker.add(stem);

    const head = new THREE.Mesh(pinHeadGeo, emeraldRingMat);
    head.position.y = 0.5;
    marker.add(head);
    rotatingElements.push(head);

    group.add(marker);
  }

  return {
    group,
    rotatingElements,
    lighthouseBeam,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
