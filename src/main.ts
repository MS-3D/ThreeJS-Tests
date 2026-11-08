import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CLIP_DURATION, workpieceOpacity, wrapTime } from "./fade.ts";
import { formatClock, phaseLabel } from "./phase.ts";

const MODEL_URL = `${import.meta.env.BASE_URL}models/scene.glb`;
const HOME_POSITION = new THREE.Vector3(4.1, 2.35, 3.25);
const HOME_TARGET = new THREE.Vector3(0.8, 0.75, 0.6);
const HOME_FOV = 45;
const BACKGROUND = new THREE.Color("#1c1e22");

function required<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Element ${selector} fehlt.`);
  return element as T;
}

const app = required<HTMLDivElement>("#app");
const canvas = required<HTMLCanvasElement>("#view");
const loader = required<HTMLDivElement>("#loader");
const loaderDetail = required<HTMLParagraphElement>("#loader-detail");
const bar = required<HTMLDivElement>("#bar");
const barFill = required<HTMLSpanElement>("#bar-fill");
const loaderPercent = required<HTMLParagraphElement>("#loader-percent");
const errorBox = required<HTMLDivElement>("#error");
const errorText = required<HTMLParagraphElement>("#error-text");
const retry = required<HTMLButtonElement>("#retry");
const phaseEl = required<HTMLSpanElement>("#phase");
const clockEl = required<HTMLSpanElement>("#clock");
const playButton = required<HTMLButtonElement>("#play");
const resetButton = required<HTMLButtonElement>("#reset");
const cinemaButton = required<HTMLButtonElement>("#cinema");
const fullButton = required<HTMLButtonElement>("#full");
const hint = required<HTMLParagraphElement>("#hint");
const speedButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-speed]")];

hint.textContent = window.matchMedia("(pointer: coarse)").matches
  ? "Ein Finger dreht · Zwei Finger schwenken und zoomen"
  : "Linke Taste dreht · Rechte Taste schwenkt · Mausrad zoomt";

retry.addEventListener("click", () => {
  window.location.reload();
});

fullButton.addEventListener("click", () => {
  toggleFullscreen();
});

document.addEventListener("fullscreenchange", () => {
  fullButton.textContent = document.fullscreenElement ? "Beenden" : "Vollbild";
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

function showError(message: string): void {
  app.classList.remove("is-loading", "is-ready");
  loader.hidden = true;
  errorBox.hidden = false;
  errorText.textContent = message;
}

function toggleFullscreen(): void {
  if (!document.fullscreenElement) {
    void app.requestFullscreen().catch(() => {
      fullButton.textContent = "Vollbild";
    });
    return;
  }
  void document.exitFullscreen();
}

function setProgress(loaded: number, total: number): void {
  if (!(total > 0)) {
    bar.classList.add("indeterminate");
    loaderPercent.textContent = "Wird gelesen …";
    return;
  }
  const percent = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
  bar.classList.remove("indeterminate");
  barFill.style.width = `${percent}%`;
  loaderPercent.textContent = `${percent} %`;
}

async function main(): Promise<void> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
  } catch (error) {
    showError(`WebGL ist nicht verfügbar. ${readableError(error)}`);
    return;
  }

  if (!renderer.getContext()) {
    showError("WebGL ist in diesem Browser nicht verfügbar.");
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = BACKGROUND;
  scene.fog = new THREE.Fog(BACKGROUND, 13, 30);

  const camera = new THREE.PerspectiveCamera(HOME_FOV, 1, 0.12, 80);
  camera.position.copy(HOME_POSITION);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.5;
  controls.maxDistance = 12;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
  controls.zoomSpeed = 0.85;
  controls.rotateSpeed = 0.85;
  controls.panSpeed = 0.75;
  controls.screenSpacePanning = true;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.55;
  controls.target.copy(HOME_TARGET);
  camera.position.copy(HOME_POSITION);
  controls.update();
  controls.saveState();
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  const hemi = new THREE.HemisphereLight(0xdfe6ee, 0x3a3a3a, 0.6);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff4e8, 2.5);
  key.position.set(3.5, 4.5, 3.5);
  key.target.position.copy(HOME_TARGET);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.4;
  key.shadow.camera.far = 18;
  key.shadow.camera.left = -4.5;
  key.shadow.camera.right = 4.5;
  key.shadow.camera.top = 4.5;
  key.shadow.camera.bottom = -4.5;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.03;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xf4f1ea, 0.55);
  fill.position.set(-4, 3, 2);
  fill.target.position.copy(HOME_TARGET);
  scene.add(fill, fill.target);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.62;
  pmrem.dispose();
  disposeRoom(room);

  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = Math.max(canvas.clientHeight, 1);
    if (width === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(app);

  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      showError("Der Grafikkontext wurde beendet. Bitte die Seite neu laden.");
    },
    false,
  );

  let gltfScene: THREE.Group;
  let animations: THREE.AnimationClip[];
  try {
    loaderDetail.textContent = "Modell, Materialien und Animation";
    const loaded = await loadModel(scene, renderer, setProgress);
    gltfScene = loaded.root;
    animations = loaded.animations;
  } catch (error) {
    showError(`Die Szenendatei konnte nicht geladen werden. ${readableError(error)}`);
    return;
  }

  const clip = animations.find((item) => item.name === "PickPlaceLoop") ?? animations[0];
  if (!clip) {
    showError("Die Szene enthält keine Animation.");
    return;
  }
  if (Math.abs(clip.duration - CLIP_DURATION) > 0.05) {
    showError(
      `Die Animation weicht von der erwarteten Länge ab (${clip.duration.toFixed(2)} s statt ${CLIP_DURATION} s).`,
    );
    return;
  }

  const workpiece = gltfScene.getObjectByName("Workpiece_Target");
  if (!(workpiece instanceof THREE.Mesh) || !(workpiece.material instanceof THREE.MeshStandardMaterial)) {
    showError("Das Werkstück Workpiece_Target fehlt in der Szene.");
    return;
  }
  const workpieceMaterial = workpiece.material.clone();
  workpiece.material = workpieceMaterial;
  const localCenter = new THREE.Vector3();
  workpiece.geometry.computeBoundingBox();
  workpiece.geometry.boundingBox?.getCenter(localCenter);

  const mixer = new THREE.AnimationMixer(gltfScene);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = false;
  action.enabled = true;
  action.play();

  let solidState: boolean | null = null;
  const applyOpacity = (time: number): void => {
    const opacity = workpieceOpacity(time);
    const hidden = opacity <= 0.02;
    const solid = opacity >= 0.985;
    workpiece.visible = !hidden;
    workpiece.castShadow = opacity > 0.45;
    if (hidden) {
      if (solidState !== false) {
        workpieceMaterial.opacity = 0;
        workpieceMaterial.transparent = true;
        workpieceMaterial.depthWrite = false;
        workpieceMaterial.needsUpdate = true;
        solidState = false;
      }
      return;
    }
    if (solidState !== solid) {
      workpieceMaterial.transparent = !solid;
      workpieceMaterial.depthWrite = solid;
      workpieceMaterial.needsUpdate = true;
      solidState = solid;
    }
    workpieceMaterial.opacity = solid ? 1 : opacity;
  };

  const seek = (time: number, pause: boolean): void => {
    const scale = action.timeScale;
    action.paused = false;
    action.timeScale = 1;
    mixer.setTime(wrapTime(time));
    action.timeScale = scale;
    action.paused = pause;
    applyOpacity(action.time);
  };

  seek(0, false);
  controls.update();
  resize();
  renderer.render(scene, camera);

  const enable = (button: HTMLButtonElement): void => {
    button.disabled = false;
  };
  enable(playButton);
  enable(resetButton);
  enable(cinemaButton);
  for (const button of speedButtons) enable(button);

  const setPlaying = (playing: boolean): void => {
    action.paused = !playing;
    playButton.textContent = playing ? "Pause" : "Weiter";
    playButton.setAttribute("aria-pressed", playing ? "false" : "true");
  };

  const setSpeed = (speed: number): void => {
    action.timeScale = speed;
    for (const button of speedButtons) {
      button.setAttribute("aria-pressed", button.dataset.speed === String(speed) ? "true" : "false");
    }
  };

  const setCinema = (on: boolean): void => {
    controls.autoRotate = on;
    cinemaButton.setAttribute("aria-pressed", on ? "true" : "false");
  };

  const resetView = (): void => {
    setCinema(false);
    const inertia = controls as unknown as {
      _sphericalDelta: { set: (x: number, y: number, z: number) => void };
      _panOffset: { set: (x: number, y: number, z: number) => void };
      _scale: number;
    };
    inertia._sphericalDelta.set(0, 0, 0);
    inertia._panOffset.set(0, 0, 0);
    inertia._scale = 1;
    camera.fov = HOME_FOV;
    camera.updateProjectionMatrix();
    controls.reset();
  };

  playButton.addEventListener("click", () => {
    setPlaying(action.paused);
  });
  resetButton.addEventListener("click", resetView);
  cinemaButton.addEventListener("click", () => {
    setCinema(!controls.autoRotate);
  });
  for (const button of speedButtons) {
    button.addEventListener("click", () => {
      const speed = Number(button.dataset.speed);
      if (Number.isFinite(speed) && speed > 0) setSpeed(speed);
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
    if (event.code === "Space") {
      event.preventDefault();
      setPlaying(action.paused);
    } else if (event.code === "KeyR") {
      resetView();
    } else if (event.code === "KeyF") {
      toggleFullscreen();
    }
  });

  let statusKey = "";
  const updateStatus = (): void => {
    const phase = phaseLabel(action.time);
    const label = action.paused ? `Pausiert · ${phase}` : phase;
    const clock = formatClock(action.time);
    const key = `${label}|${clock}`;
    if (key === statusKey) return;
    statusKey = key;
    phaseEl.textContent = label;
    clockEl.textContent = clock;
  };
  updateStatus();

  const worldCenter = new THREE.Vector3();
  const debug = {
    ready: true,
    setTime: (time: number) => {
      seek(time, true);
      playButton.textContent = "Weiter";
      playButton.setAttribute("aria-pressed", "true");
      updateStatus();
      controls.update();
      renderer.render(scene, camera);
    },
    getTime: () => action.time,
    setPlaying,
    isPlaying: () => !action.paused,
    setSpeed,
    getSpeed: () => action.timeScale,
    resetView: () => {
      resetView();
      renderer.render(scene, camera);
    },
    setCinema,
    getOpacity: () => workpieceOpacity(action.time),
    isWorkpieceVisible: () => workpiece.visible,
    getWorkpieceCenter: () => {
      worldCenter.copy(localCenter);
      workpiece.localToWorld(worldCenter);
      return { x: worldCenter.x, y: worldCenter.y, z: worldCenter.z };
    },
    getLocalQuaternion: (name: string) => {
      const object = gltfScene.getObjectByName(name);
      if (!object) return null;
      return {
        x: object.quaternion.x,
        y: object.quaternion.y,
        z: object.quaternion.z,
        w: object.quaternion.w,
      };
    },
    getLocalPosition: (name: string) => {
      const object = gltfScene.getObjectByName(name);
      if (!object) return null;
      return { x: object.position.x, y: object.position.y, z: object.position.z };
    },
    getWorldPosition: (name: string) => {
      const object = gltfScene.getObjectByName(name);
      if (!object) return null;
      const position = object.getWorldPosition(new THREE.Vector3());
      return { x: position.x, y: position.y, z: position.z };
    },
    getCamera: () => ({
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    }),
    getClip: () => ({
      name: clip.name,
      duration: clip.duration,
      tracks: clip.tracks.map((track) => track.name),
    }),
    parentChain: (name: string) => {
      const names: string[] = [];
      let current = gltfScene.getObjectByName(name)?.parent ?? null;
      while (current) {
        names.push(current.name || current.type);
        current = current.parent;
      }
      return names;
    },
  };
  window.__zelle = debug;

  app.classList.add("is-ready");
  console.info(
    `PickPlaceLoop ${clip.duration.toFixed(2)} s, ${clip.tracks.length} Spuren. Werkstück bleibt an der animierten Transformation.`,
  );

  const clock = new THREE.Clock();
  const tick = (): void => {
    const delta = Math.min(clock.getDelta(), 1 / 20);
    mixer.update(delta);
    applyOpacity(action.time);
    controls.update();
    updateStatus();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function loadModel(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  onProgress: (loaded: number, total: number) => void,
): Promise<{ root: THREE.Group; animations: THREE.AnimationClip[] }> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      MODEL_URL,
      (gltf) => {
        const root = gltf.scene;
        prepareMaterials(root, renderer);
        scene.add(root);
        resolve({ root, animations: gltf.animations });
      },
      (event) => {
        onProgress(event.loaded, event.total);
      },
      (error) => {
        reject(error);
      },
    );
  });
}

function prepareMaterials(root: THREE.Object3D, renderer: THREE.WebGLRenderer): void {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const isFloor = object.name.startsWith("Floor_");
    object.castShadow = !isFloor;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || !material.map) continue;
      if (material.name !== "Hazard_Tape") continue;
      material.map.wrapS = THREE.RepeatWrapping;
      material.map.wrapT = THREE.RepeatWrapping;
      material.map.anisotropy = anisotropy;
      material.map.needsUpdate = true;
    }
  });
}

function disposeRoom(room: THREE.Object3D): void {
  room.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}

function readableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Unbekannter Fehler.";
}

void main();
