import React, {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import type {ThreeCameraPreset} from '../../domain/types';
import {
  buildPolishLandmarksRig,
  createTopographicBumpTexture,
  latLngToWorldXZ,
} from './polandLandmarksBuilder';

const POLAND_BORDER_LAT_LNG: readonly [number, number][] = [
  [54.35, 19.65],
  [54.37, 22.8],
  [53.95, 23.52],
  [53.1, 23.95],
  [52.1, 23.62],
  [51.2, 23.95],
  [50.45, 24.15],
  [49.8, 22.95],
  [49.05, 22.7],
  [49.35, 21.2],
  [49.18, 20.05],
  [49.5, 19.1],
  [49.7, 18.6],
  [50.28, 17.5],
  [50.45, 16.5],
  [50.8, 15.4],
  [51.1, 14.95],
  [52.05, 14.65],
  [52.75, 14.15],
  [53.35, 14.4],
  [53.92, 14.25],
  [54.2, 15.6],
  [54.55, 16.8],
  [54.83, 18.3],
  [54.6, 18.8],
  [54.35, 19.0],
];

const VISTULA_POINTS: readonly [number, number][] = [
  [49.65, 19.0],
  [50.06, 19.94],
  [50.68, 21.75],
  [51.32, 21.95],
  [52.25, 21.01],
  [53.01, 18.6],
  [54.35, 18.95],
];

const ODRA_POINTS: readonly [number, number][] = [
  [50.0, 18.2],
  [50.67, 17.92],
  [51.11, 17.03],
  [51.9, 15.5],
  [52.6, 14.55],
  [53.43, 14.57],
];

interface CameraRigTarget {
  readonly radius: number;
  readonly height: number;
  readonly baseAngle: number;
  readonly orbitSpeed: number;
  readonly lookLat: number;
  readonly lookLng: number;
  readonly lookY: number;
}

const CAMERA_PRESET_TARGETS: Readonly<Record<ThreeCameraPreset, CameraRigTarget>> = {
  overview: {
    radius: 11.4,
    height: 9.6,
    baseAngle: 0.16,
    orbitSpeed: 0.065,
    lookLat: 51.85,
    lookLng: 19.15,
    lookY: 0.35,
  },
  warszawa: {
    radius: 4.1,
    height: 3.4,
    baseAngle: 0.55,
    orbitSpeed: 0.14,
    lookLat: 52.23,
    lookLng: 21.01,
    lookY: 0.95,
  },
  gdansk: {
    radius: 4.5,
    height: 3.6,
    baseAngle: -0.45,
    orbitSpeed: 0.12,
    lookLat: 54.32,
    lookLng: 18.82,
    lookY: 0.78,
  },
  tatry: {
    radius: 5.0,
    height: 3.9,
    baseAngle: 0.35,
    orbitSpeed: 0.11,
    lookLat: 49.62,
    lookLng: 19.95,
    lookY: 0.85,
  },
};

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) {
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createCartographicGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0a111a';
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = 'rgba(52, 211, 153, 0.11)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 512; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 512; i += 128) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.anisotropy = Math.min(8, maxAnisotropy);
  return texture;
}

export interface PolandReliefSceneProps {
  readonly cameraPreset?: ThreeCameraPreset;
  readonly className?: string;
}

export const PolandReliefScene: React.FC<PolandReliefSceneProps> = ({
  cameraPreset = 'overview',
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const presetRef = useRef<ThreeCameraPreset>(cameraPreset);
  presetRef.current = cameraPreset;

  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) {
      return;
    }

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090e14);
    scene.fog = new THREE.FogExp2(0x090e14, 0.036);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 120);
    camera.position.set(1.8, 10.6, 12.2);
    camera.lookAt(0, 0.35, 0.2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setContextLost(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // Studio PBR environment reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // Warm golden key + cool atmospheric hemisphere + emerald rim
    const hemiLight = new THREE.HemisphereLight(0x9ecaff, 0x0b1520, 0.78);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff0d1, 2.35);
    keyLight.position.set(9, 15, 8);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 36;
    keyLight.shadow.camera.left = -9.5;
    keyLight.shadow.camera.right = 9.5;
    keyLight.shadow.camera.top = 9.5;
    keyLight.shadow.camera.bottom = -9.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.025;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x10b981, 1.35);
    rimLight.position.set(-10, 6.5, -9);
    scene.add(rimLight);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Extended ocean/horizon cartographic floor plane
    const gridTexture = createCartographicGridTexture(maxAniso);
    const floorGeo = new THREE.PlaneGeometry(76, 76);
    const floorMat = new THREE.MeshStandardMaterial({
      map: gridTexture,
      roughness: 0.84,
      metalness: 0.16,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    const mapGroup = new THREE.Group();
    scene.add(mapGroup);

    // Extruded Poland relief plateau with procedural bump/roughness variation
    const shape = new THREE.Shape();
    POLAND_BORDER_LAT_LNG.forEach(([lat, lng], idx) => {
      const {x, z} = latLngToWorldXZ(lat, lng);
      if (idx === 0) {
        shape.moveTo(x, -z);
      } else {
        shape.lineTo(x, -z);
      }
    });
    shape.closePath();

    const baseExtrudeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.42,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.08,
      bevelSegments: 3,
    });
    baseExtrudeGeo.rotateX(-Math.PI / 2);

    const topoBumpTex = createTopographicBumpTexture(maxAniso);
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x182838,
      bumpMap: topoBumpTex,
      bumpScale: 0.04,
      roughnessMap: topoBumpTex,
      roughness: 0.68,
      metalness: 0.22,
    });
    const terrainMesh = new THREE.Mesh(baseExtrudeGeo, terrainMat);
    terrainMesh.castShadow = !isSoftwareGl;
    terrainMesh.receiveShadow = true;
    mapGroup.add(terrainMesh);

    // Glowing emerald border contour above plateau
    const borderPoints = POLAND_BORDER_LAT_LNG.map(([lat, lng]) => {
      const {x, z} = latLngToWorldXZ(lat, lng);
      return new THREE.Vector3(x, 0.515, z);
    });
    borderPoints.push(borderPoints[0].clone());
    const borderCurve = new THREE.CatmullRomCurve3(borderPoints, true);
    const borderTubeGeo = new THREE.TubeGeometry(borderCurve, 140, 0.03, 8, true);
    const borderTubeMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.7,
    });
    const borderMesh = new THREE.Mesh(borderTubeGeo, borderTubeMat);
    mapGroup.add(borderMesh);

    // River tubes (Wisla & Odra)
    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0369a1,
      emissiveIntensity: 0.38,
      roughness: 0.18,
      metalness: 0.58,
    });
    const buildRiver = (pts: readonly [number, number][]) => {
      const vecs = pts.map(([lat, lng]) => {
        const {x, z} = latLngToWorldXZ(lat, lng);
        return new THREE.Vector3(x, 0.518, z);
      });
      const curve = new THREE.CatmullRomCurve3(vecs);
      const geo = new THREE.TubeGeometry(curve, 64, 0.04, 8, false);
      const mesh = new THREE.Mesh(geo, riverMat);
      mapGroup.add(mesh);
      return geo;
    };
    const vistulaGeo = buildRiver(VISTULA_POINTS);
    const odraGeo = buildRiver(ODRA_POINTS);

    // Composite architectural Polish landmarks + alpine peaks + instanced forests
    const landmarksRig = buildPolishLandmarksRig(0.5, !isSoftwareGl);
    mapGroup.add(landmarksRig.group);

    // Reusable scratch vectors (zero allocations in render loop)
    const targetPointer = {x: 0, y: 0};
    const smoothPointer = {x: 0, y: 0};
    const desiredCamPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();
    const currentLook = new THREE.Vector3(0, 0.35, 0.2);

    const handlePointerMove = (e: PointerEvent) => {
      targetPointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      targetPointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', handlePointerMove, {passive: true});

    const handleResize = () => {
      if (!container) {
        return;
      }
      const nextW = container.clientWidth || window.innerWidth;
      const nextH = container.clientHeight || window.innerHeight;
      camera.aspect = nextW / nextH;
      camera.updateProjectionMatrix();
      renderer.setSize(nextW, nextH);
    };
    window.addEventListener('resize', handleResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) {
        return;
      }
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      const pointerDamp = 1 - Math.exp(-3.5 * dt);
      smoothPointer.x += (targetPointer.x - smoothPointer.x) * pointerDamp;
      smoothPointer.y += (targetPointer.y - smoothPointer.y) * pointerDamp;

      const rigTarget = CAMERA_PRESET_TARGETS[presetRef.current];
      const lookXZ = latLngToWorldXZ(rigTarget.lookLat, rigTarget.lookLng);
      desiredLook.set(lookXZ.x, rigTarget.lookY, lookXZ.z);

      const angle = rigTarget.baseAngle + elapsed * rigTarget.orbitSpeed + smoothPointer.x * 0.2;
      desiredCamPos.set(
        lookXZ.x + Math.sin(angle) * rigTarget.radius,
        rigTarget.height + smoothPointer.y * 0.55,
        lookXZ.z + Math.cos(angle) * rigTarget.radius,
      );

      const camDamp = 1 - Math.exp(-3.2 * dt);
      camera.position.lerp(desiredCamPos, camDamp);
      currentLook.lerp(desiredLook, camDamp);
      camera.lookAt(currentLook);

      for (let i = 0; i < landmarksRig.rotatingElements.length; i += 1) {
        landmarksRig.rotatingElements[i].rotation.y = elapsed * 0.9 + i * 0.7;
      }
      if (landmarksRig.lighthouseBeam) {
        landmarksRig.lighthouseBeam.rotation.y = elapsed * 0.95;
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      landmarksRig.dispose();
      gridTexture.dispose();
      topoBumpTex.dispose();
      envTarget.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      baseExtrudeGeo.dispose();
      terrainMat.dispose();
      borderTubeGeo.dispose();
      borderTubeMat.dispose();
      vistulaGeo.dispose();
      odraGeo.dispose();
      riverMat.dispose();

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (contextLost) {
    return (
      <div
        className={`relative h-full w-full bg-gradient-to-br from-[#090E14] via-[#101B28] to-[#091512] ${className}`}
        aria-hidden="true"
      />
    );
  }

  return <div ref={mountRef} className={`h-full w-full ${className}`} aria-hidden="true" />;
};
