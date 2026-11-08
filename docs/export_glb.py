import bpy, math, numpy as np
from mathutils import Vector
sc=bpy.context.scene; O=bpy.data.objects
# --- remove camera/lights/helper empties not needed
for o in list(O):
    if o.type in('CAMERA','LIGHT') or o.name=="Camera_Target": bpy.data.objects.remove(o)
# --- extend animation: return robot to HOME so pose loops seamlessly
bx,by=.3,-1.15; L1,L2,SH,TL=.85,.8,.7,.30
def ss(t): t=max(0,min(1,t)); return t*t*(3-2*t)
def ik(psi,rho,z):
    r=rho-.08; h=z+TL-SH; d=math.hypot(r,h)
    beta=math.atan2(r,h); a=math.acos(max(-1,min(1,(L1*L1+d*d-L2*L2)/(2*L1*d))))
    p1=beta-a; ex,ez=L1*math.sin(p1),L1*math.cos(p1); p2=math.atan2(r-ex,h-ez); return p1,p2-p1,math.pi-p2
pl_psi=math.atan2(-(1.6-bx),-0.87-by); pl_rho=math.hypot(1.6-bx,-0.87-by)
A=(pl_psi,pl_rho,.8); HOME=(-.6,.6,1.5); END=216
J=[O[n] for n in("J1_Axis_Base","J2_Axis_Shoulder","J3_Axis_Elbow","J5_Axis_Wrist")]
for f in range(181,END+1):
    t=ss((f-180)/(END-6-180)); psi,rho,z=[a+(b-a)*t for a,b in zip(A,HOME)]
    a2,a3,a5=ik(psi,rho,z)
    J[0].rotation_euler.z=psi; J[1].rotation_euler.x=-a2; J[2].rotation_euler.x=-a3; J[3].rotation_euler.x=-a5
    for o in J: o.keyframe_insert("rotation_euler",frame=f)
    for n in("Gripper_Finger_-1","Gripper_Finger_+1","Workpiece_Target"):
        for p in(("location","rotation_euler") if n=="Workpiece_Target" else ("location",)): O[n].keyframe_insert(p,frame=f)
sc.frame_start,sc.frame_end=1,END
# --- materials -> plain PBR
def flat(m):
    nt=m.node_tree; N=nt.nodes; b=N.get("Principled BSDF")
    mx=[n for n in N if n.bl_idname=="ShaderNodeMix"]; mr=[n for n in N if n.bl_idname=="ShaderNodeMapRange"]
    col=None
    if mx: a=mx[0].inputs["A"].default_value; c=mx[0].inputs["B"].default_value; col=[(a[i]+c[i])/2 for i in range(3)]+[1]
    rough=(mr[0].inputs["To Min"].default_value+mr[0].inputs["To Max"].default_value)/2 if mr else b.inputs["Roughness"].default_value
    for n in list(N):
        if n not in(b,N.get("Material Output")): N.remove(n)
    if col: b.inputs["Base Color"].default_value=col
    b.inputs["Roughness"].default_value=rough
for m in bpy.data.materials:
    if m.name!="Hazard_Tape": flat(m)
# hazard: stripe image + world-diagonal UVs
img=bpy.data.images.new("hazard_stripes",64,8); px=np.zeros((8,64,4),np.float32)
px[:,:32]=(.02,.02,.02,1); px[:,32:]=(.9,.62,.02,1); img.pixels=px.ravel(); img.pack()
m=bpy.data.materials["Hazard_Tape"]; N=m.node_tree.nodes; b=N["Principled BSDF"]
for n in list(N):
    if n not in(b,N["Material Output"]): N.remove(n)
tx=N.new("ShaderNodeTexImage"); tx.image=img; m.node_tree.links.new(tx.outputs[0],b.inputs["Base Color"]); b.inputs["Roughness"].default_value=.6
for o in O:
    if o.type=='MESH' and o.data.materials and o.data.materials[0].name=="Hazard_Tape":
        me=o.data; uv=me.uv_layers.active or me.uv_layers.new()
        for l in me.loops:
            co=o.matrix_world@me.vertices[l.vertex_index].co; uv.data[l.index].uv=((co.x+co.y)*6,co.y*6)
# --- linear interpolation for baked keys
bpy.ops.export_scene.gltf(filepath="/workspace/web_export/scene.glb",export_format='GLB',export_apply=True,
    export_animation_mode='SCENE',export_force_sampling=True,export_frame_range=True,export_anim_single_armature=False,
    export_cameras=False,export_lights=False,export_yup=True,export_materials='EXPORT',export_image_format='AUTO',
    export_draco_mesh_compression_enable=False,export_optimize_animation_size=True)
print("EXPORTED")
