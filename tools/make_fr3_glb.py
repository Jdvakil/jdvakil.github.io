"""Build assets/fr3/fr3.glb: FR3 + Franka Hand visual meshes, one node per (body, material).

Mesh vertices stay in the MuJoCo body frame (none of the Menagerie visual geoms carry a
pos/quat), so the web viewer only has to place each body group at data.xpos/xquat.

Usage (needs `pip install trimesh fast-simplification` and a mujoco_menagerie checkout):
    python tools/make_fr3_glb.py path/to/mujoco_menagerie /tmp/fr3_raw.glb
    npx @gltf-transform/cli meshopt /tmp/fr3_raw.glb assets/fr3/fr3.glb --level high
"""
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

import fast_simplification
import numpy as np
import trimesh

MEN = sys.argv[1]
OUT = sys.argv[2]


def visual_geoms(xml_path, keep_body):
    """Yields (body_name, mesh_file_stem, material) for visual geoms in an MJCF file."""
    root = ET.parse(xml_path).getroot()
    mesh_files = {}
    for m in root.iter('mesh'):
        f = m.get('file')
        mesh_files[m.get('name') or f.rsplit('.', 1)[0]] = f
    for body in root.iter('body'):
        name = body.get('name')
        if not keep_body(name):
            continue
        for g in body.findall('geom'):
            if g.get('class') == 'visual':
                yield name, mesh_files[g.get('mesh')], g.get('material')


def creased(mesh, angle):
    """Per-corner normals averaged only over faces within `angle`; re-indexed."""
    fn = mesh.face_normals
    fa = mesh.area_faces
    vf = mesh.vertex_faces
    faces = mesh.faces
    cv = faces.reshape(-1)
    cf = np.repeat(np.arange(len(faces)), 3)
    nb = vf[cv]
    valid = nb >= 0
    nbi = np.where(valid, nb, 0)
    nbn = fn[nbi]
    dots = np.einsum('ckd,cd->ck', nbn, fn[cf])
    w = (valid & (dots > np.cos(angle))) * fa[nbi]
    n = np.einsum('ck,ckd->cd', w, nbn)
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    key = np.column_stack([cv, np.round(n * 4096).astype(np.int64)])
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    out = trimesh.Trimesh(mesh.vertices[cv[first]], inv.reshape(-1, 3),
                          vertex_normals=n[first], process=False)
    return out


parts = defaultdict(list)
for body, f, mat in visual_geoms(f'{MEN}/franka_fr3/fr3.xml', lambda n: n.startswith('fr3_link')):
    parts[(body, mat)].append(f'{MEN}/franka_fr3/assets/{f}')
for body, f, mat in visual_geoms(f'{MEN}/franka_emika_panda/panda.xml',
                                 lambda n: n in ('hand', 'left_finger', 'right_finger')):
    parts[(body, mat)].append(f'{MEN}/franka_emika_panda/assets/{f}')

MAX_DENSITY = 45  # faces per cm^2
scene = trimesh.Scene()
total_in = total_out = 0
cache = {}
for (body, mat), files in parts.items():
    key = (tuple(files), mat)
    if key in cache:  # right_finger reuses the left finger meshes
        mesh = cache[key]
    else:
        meshes = []
        for f in files:
            m = trimesh.load(f, force='mesh', process=False)
            # Weld by position only so the simplifier sees connected surfaces.
            m = trimesh.Trimesh(m.vertices, m.faces, process=True)
            n = len(m.faces)
            total_in += n
            # Cap triangle density: big smooth shells stay intact, dense logo/screw
            # detail gets simplified.
            keep = int(min(n, max(200, m.area * 1e4 * MAX_DENSITY)))
            if keep < n:
                v, fc = fast_simplification.simplify(
                    m.vertices.astype(np.float32), m.faces.astype(np.int32),
                    target_count=keep, agg=6)
                m = trimesh.Trimesh(v, fc, process=True)
            meshes.append(m)
        mesh = trimesh.util.concatenate(meshes)
        mesh = creased(mesh, np.radians(32))
        total_out += len(mesh.faces)
        cache[key] = mesh
    m = mesh.copy()
    m.visual = trimesh.visual.ColorVisuals(m)
    m.visual.material = trimesh.visual.material.PBRMaterial(name=mat)
    m.metadata['name'] = f'{body}__{mat}'
    scene.add_geometry(m, node_name=f'{body}__{mat}', geom_name=f'{body}__{mat}')
    print(f'{body:14s} {mat:14s} faces={len(mesh.faces):7d} verts={len(mesh.vertices):7d}')

print('faces in', total_in, 'out', total_out)
scene.export(OUT, include_normals=True)
print('wrote', OUT)
