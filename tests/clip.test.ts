import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { WORKPIECE_JUMP_TIME, workpieceOpacity } from "../src/fade.ts";

interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  matrix?: number[];
}

interface GltfJson {
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  nodes: GltfNode[];
  meshes: Array<{ primitives: Array<{ indices?: number; attributes: { POSITION?: number }; material?: number }> }>;
  accessors: GltfAccessor[];
  bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }>;
  animations: Array<{
    name?: string;
    channels: Array<{ sampler: number; target: { node: number; path: string } }>;
    samplers: Array<{ input: number; output: number; interpolation?: string }>;
  }>;
}

function readGlb(file: string): { json: GltfJson; bin: Uint8Array } {
  const raw = fs.readFileSync(file);
  const fileBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const view = new DataView(fileBuffer);
  const jsonLength = view.getUint32(12, true);
  const jsonStart = 20;
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(fileBuffer, jsonStart, jsonLength))) as GltfJson;
  const binHeader = 20 + jsonLength;
  const binLength = view.getUint32(binHeader, true);
  const bin = new Uint8Array(fileBuffer, binHeader + 8, binLength);
  return { json, bin };
}

function readFloats(json: GltfJson, bin: Uint8Array, accessorIndex: number): Float32Array {
  const accessor = json.accessors[accessorIndex];
  if (!accessor || accessor.componentType !== 5126) {
    throw new Error(`Accessor ${accessorIndex} is not float32`);
  }
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  if (!components) throw new Error(`Unsupported accessor type ${accessor.type}`);
  const bufferView = json.bufferViews[accessor.bufferView];
  if (!bufferView) throw new Error(`Missing buffer view for accessor ${accessorIndex}`);
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? components * 4;
  const aligned = new ArrayBuffer(accessor.count * components * 4);
  const out = new Float32Array(aligned);
  if (stride === components * 4) {
    out.set(new Float32Array(bin.buffer, bin.byteOffset + start, accessor.count * components));
    return out;
  }
  for (let i = 0; i < accessor.count; i += 1) {
    const slice = new Float32Array(bin.buffer, bin.byteOffset + start + i * stride, components);
    out.set(slice, i * components);
  }
  return out;
}

function triangleCount(json: GltfJson): number {
  let triangles = 0;
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      if (primitive.indices !== undefined) {
        const accessor = json.accessors[primitive.indices];
        if (accessor) triangles += Math.floor(accessor.count / 3);
      } else if (primitive.attributes.POSITION !== undefined) {
        const accessor = json.accessors[primitive.attributes.POSITION];
        if (accessor) triangles += Math.floor(accessor.count / 3);
      }
    }
  }
  return triangles;
}

function buildRig(json: GltfJson, bin: Uint8Array): { root: THREE.Group; clip: THREE.AnimationClip } {
  const objects = json.nodes.map((node) => {
    const object = new THREE.Object3D();
    object.name = node.name ?? "";
    if (node.matrix) {
      object.applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
    } else {
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation);
      if (node.scale) object.scale.fromArray(node.scale);
    }
    return object;
  });
  const attached = new Set<number>();
  json.nodes.forEach((node, index) => {
    for (const child of node.children ?? []) {
      const childObject = objects[child];
      const parent = objects[index];
      if (childObject && parent) {
        parent.add(childObject);
        attached.add(child);
      }
    }
  });
  const root = new THREE.Group();
  objects.forEach((object, index) => {
    if (!attached.has(index)) root.add(object);
  });

  const animation = json.animations[0];
  if (!animation) throw new Error("No animation");
  const tracks = animation.channels.map((channel) => {
    const sampler = animation.samplers[channel.sampler];
    if (!sampler) throw new Error("Missing sampler");
    const node = json.nodes[channel.target.node];
    const times = Array.from(readFloats(json, bin, sampler.input));
    const values = Array.from(readFloats(json, bin, sampler.output));
    const property = channel.target.path === "rotation" ? "quaternion" : "position";
    const name = `${node?.name ?? ""}.${property}`;
    if (property === "quaternion") return new THREE.QuaternionKeyframeTrack(name, times, values);
    return new THREE.VectorKeyframeTrack(name, times, values);
  });
  const clip = new THREE.AnimationClip(animation.name ?? "PickPlaceLoop", undefined, tracks);
  return { root, clip };
}

const modelPath = path.resolve("public/models/scene.glb");
const { json, bin } = readGlb(modelPath);
const { root, clip } = buildRig(json, bin);
const mixer = new THREE.AnimationMixer(root);
const action = mixer.clipAction(clip);
action.setLoop(THREE.LoopRepeat, Infinity);
action.play();

function poseAt(time: number): void {
  action.paused = false;
  action.timeScale = 1;
  mixer.setTime(time);
  root.updateMatrixWorld(true);
}

function workpieceCenter(): THREE.Vector3 {
  const node = json.nodes.find((item) => item.name === "Workpiece_Target");
  const meshIndex = node?.mesh;
  if (meshIndex === undefined) throw new Error("Workpiece mesh missing");
  const mesh = json.meshes[meshIndex];
  const positionIndex = mesh?.primitives[0]?.attributes.POSITION;
  if (positionIndex === undefined) throw new Error("Workpiece positions missing");
  const accessor = json.accessors[positionIndex];
  if (!accessor?.min || !accessor.max) throw new Error("Workpiece bounds missing");
  const local = new THREE.Vector3(
    (accessor.min[0]! + accessor.max[0]!) / 2,
    (accessor.min[1]! + accessor.max[1]!) / 2,
    (accessor.min[2]! + accessor.max[2]!) / 2,
  );
  const object = root.getObjectByName("Workpiece_Target");
  if (!object) throw new Error("Workpiece node missing");
  return object.localToWorld(local);
}

function quat(name: string): THREE.Quaternion {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Missing ${name}`);
  return object.quaternion.clone();
}

describe("scene.glb contract", () => {
  it("is the exported cell, uncompressed, with one synchronized clip", () => {
    expect(json.nodes).toHaveLength(254);
    expect(json.meshes).toHaveLength(248);
    expect(triangleCount(json)).toBe(79222);
    expect(json.extensionsUsed ?? []).not.toContain("KHR_draco_mesh_compression");
    expect(json.extensionsRequired ?? []).toEqual([]);
    expect(json.animations).toHaveLength(1);
    expect(json.animations[0]?.name).toBe("PickPlaceLoop");
    expect(json.animations[0]?.channels).toHaveLength(8);
    expect(clip.duration).toBeCloseTo(9, 5);
    expect(root.getObjectByName("Workpiece_Target")?.parent).toBe(root);
    const finger = root.getObjectByName("Gripper_Finger_+1");
    const chain: string[] = [];
    let current = finger?.parent ?? null;
    while (current) {
      chain.push(current.name);
      current = current.parent;
    }
    expect(chain).toEqual(expect.arrayContaining(["J6_Axis_Flange", "J5_Axis_Wrist", "J3_Axis_Elbow", "J2_Axis_Shoulder", "J1_Axis_Base"]));
  });
});

describe("PickPlaceLoop continuity", () => {
  it("returns the robot and the fingers to the start pose without a joint snap", () => {
    poseAt(0.0416667);
    const start = ["J1_Axis_Base", "J2_Axis_Shoulder", "J3_Axis_Elbow", "J5_Axis_Wrist"].map((name) => quat(name));
    const fingerStart = root.getObjectByName("Gripper_Finger_+1")?.position.clone();
    poseAt(8.999);
    ["J1_Axis_Base", "J2_Axis_Shoulder", "J3_Axis_Elbow", "J5_Axis_Wrist"].forEach((name, index) => {
      expect(quat(name).angleTo(start[index]!), name).toBeLessThan(THREE.MathUtils.degToRad(0.2));
    });
    const fingerEnd = root.getObjectByName("Gripper_Finger_+1")?.position;
    expect(fingerEnd && fingerStart ? fingerEnd.distanceTo(fingerStart) : Infinity).toBeLessThan(1e-4);
  });

  it("keeps the block on the authored transform and only hides the pallet-to-belt snap", () => {
    poseAt(1.2);
    const belt = workpieceCenter().clone();
    expect(belt.distanceTo(new THREE.Vector3(0.3, 0.935, 0))).toBeLessThan(0.01);
    expect(workpieceOpacity(1.2)).toBe(1);

    poseAt(0.2);
    const homeJoint = quat("J1_Axis_Base");
    const openPositive = root.getObjectByName("Gripper_Finger_+1")!.position.x;
    const openNegative = root.getObjectByName("Gripper_Finger_-1")!.position.x;
    poseAt(3.2);
    expect(quat("J1_Axis_Base").angleTo(homeJoint)).toBeGreaterThan(THREE.MathUtils.degToRad(15));
    expect(openPositive - root.getObjectByName("Gripper_Finger_+1")!.position.x).toBeGreaterThan(0.02);
    expect(root.getObjectByName("Gripper_Finger_-1")!.position.x - openNegative).toBeGreaterThan(0.02);

    const wristGap = (time: number): number => {
      poseAt(time);
      const wrist = root.getObjectByName("J5_Axis_Wrist")!.getWorldPosition(new THREE.Vector3());
      return wrist.distanceTo(workpieceCenter());
    };
    const carriedGaps = [4.0, 4.6, 5.2, 5.9].map((time) => wristGap(time));
    for (const gap of carriedGaps) {
      expect(gap).toBeGreaterThan(0.2);
      expect(gap).toBeLessThan(0.5);
    }
    const spread = Math.max(...carriedGaps) - Math.min(...carriedGaps);
    expect(spread).toBeLessThan(0.08);
    expect(wristGap(1.2)).toBeGreaterThan(0.8);
    poseAt(4.6);
    const carried = workpieceCenter().clone();
    expect(carried.distanceTo(belt)).toBeGreaterThan(0.4);
    expect(workpieceOpacity(4.6)).toBe(1);

    poseAt(7.5);
    const pallet = workpieceCenter().clone();
    poseAt(7.56);
    const reset = workpieceCenter().clone();
    expect(pallet.distanceTo(reset)).toBeGreaterThan(1);
    expect(workpieceOpacity(7.5)).toBe(0);
    expect(workpieceOpacity(WORKPIECE_JUMP_TIME)).toBe(0);
    expect(workpieceOpacity(7.56)).toBe(0);
    expect(reset.distanceTo(belt)).toBeLessThan(0.05);

    poseAt(7.5);
    const jointsBefore = ["J1_Axis_Base", "J2_Axis_Shoulder", "J3_Axis_Elbow", "J5_Axis_Wrist"].map((name) => quat(name));
    poseAt(7.56);
    ["J1_Axis_Base", "J2_Axis_Shoulder", "J3_Axis_Elbow", "J5_Axis_Wrist"].forEach((name, index) => {
      expect(quat(name).angleTo(jointsBefore[index]!), name).toBeLessThan(THREE.MathUtils.degToRad(3));
    });
  });
});
