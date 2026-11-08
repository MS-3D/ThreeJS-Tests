# Conveyor + 6-axis robot – web assets

**Source:** `fliessband_roboter_realistisch.blend` (Blender 5.2.3 LTS). The source was not modified. The export runs with `export_glb.py` (included).

## scene.glb
- About 2.46 MB. 254 nodes, 248 meshes, about 79k triangles, 19 PBR materials. Bevel modifiers are applied. No Draco compression, so the plain GLTFLoader is enough.
- glTF Y-up, units in metres. Blender (x, y, z) becomes glTF (x, z, −y).
- No camera or lights are included; the app handles those.
- Procedural materials were turned into constant PBR values (base colour, roughness, metalness). The hazard tape uses an embedded 64×8 stripe texture with repeat wrapping.

## Animation
- One clip: **`PickPlaceLoop`**. It has 8 channels, LINEAR, sampled per frame at 24 fps.
- Times run from 1/24 to 9.0 s, so the clip duration is **9.0 s (216 frames)**. That is 7.5 s of pick-and-place plus a 1.5 s return to the start pose.
- Animated nodes:
  - `J1_Axis_Base`, `J2_Axis_Shoulder`, `J3_Axis_Elbow`, `J5_Axis_Wrist`: rotation.
  - `Gripper_Finger_-1` and `Gripper_Finger_+1`: translation. Carriages and bolts are child nodes and move with the fingers.
  - `Workpiece_Target`: translation and rotation. This is the blue block. It is a root node, so its values are world transforms.
- All housings, bolts, cables and gripper parts are child nodes of the joints. Don't flatten the hierarchy.
- Timeline:

  | Phase | Frames |
  |---|---|
  | Start pose | 1–10 |
  | Approach | 10–46 |
  | Descend | 46–64 |
  | Gripper closes | 64–76 |
  | Lift | 76–96 |
  | Swing at height | 96–128 |
  | Lower | 128–152 |
  | Open | 152–162 |
  | Retract | 164–180 |
  | Return to start pose | 180–210 |
  | Rest | 210–216 |

## Looping
- `mixer.clipAction(clip).setLoop(THREE.LoopRepeat)`.
- The robot and fingers loop without a jump.
- **The block jumps at the wrap:** it disappears from the pallet (glTF approx. (1.6, 0.22, 0.87)) and reappears at the pick spot on the belt (0.30, 0.935, 0.00).
- Suggestions for the app:
  - Fade the block out and back in, or briefly scale it to 0 over the last and first ~0.2 s.
  - Or spawn a visual clone of the placed block on the pallet and leave it there, with a cap on how many stack up.
  - Or animate the block in by sliding it along the belt (+x direction) to the pick spot during 0–1.5 s.
- The belt itself is not animated. You can scroll a belt texture or offset the belt mesh in the app if you want.

## Suggested camera and lights (glTF coordinates)
- **OrbitControls:** camera (4.1, 2.35, 3.25), target (0.8, 0.75, 0.6), fov about 45°, minDistance 1.5, maxDistance 12, maxPolarAngle about 85° so the camera stays above the floor.
- **Lights:**
  - HemisphereLight (sky #dfe6ee, ground #3a3a3a, about 0.6).
  - DirectionalLight with shadows from about (3.5, 4.5, 3.5) towards the target, intensity about 2.5, shadow camera covering ±4 m.
  - Weaker fill light from (−4, 3, 2).
  - Optional: RoomEnvironment or PMREM for metal reflections. Without an environment map, the metals look dark.
- **Renderer:** ACES or AgX tone mapping, sRGB output, `castShadow` and `receiveShadow` on meshes. The floor is a 30 m plane.

## Limitations
- The surface noise, corrugation and grain from the Blender materials are not baked; the materials are flat colours.
- The wrist roll axes (J4, J6) don't move.
- It is a generic robot design, not a real model.
- The original Blender render used Cycles. Three.js will look different, especially reflections and contact shadows.

## Files
- `scene.glb`
- `preview_realistisch.png`: Cycles reference image, 1280×960.
- `glb_reimport_preview.png`: the GLB re-imported into Blender, to check the materials.
- `export_glb.py` and `merge_animations.py`: Blender export, then merging the per-object clips into one clip
