# Post-step after export_glb.py: merges per-object glTF animations into one clip "PickPlaceLoop"
import json,struct
d=open('scene.glb','rb').read(); n=struct.unpack('<I',d[12:16])[0]; g=json.loads(d[20:20+n]); rest=d[20+n:]
ch=[];sm=[]
for a in g['animations']:
    off=len(sm); sm+=a['samplers']
    for c in a['channels']: c=dict(c); c['sampler']+=off; ch.append(c)
g['animations']=[{'name':'PickPlaceLoop','channels':ch,'samplers':sm}]
j=json.dumps(g,separators=(',',':')).encode(); j+=b' '*((4-len(j)%4)%4)
open('scene.glb','wb').write(struct.pack('<III',0x46546C67,2,20+len(j)+len(rest))+struct.pack('<II',len(j),0x4E4F534A)+j+rest)
