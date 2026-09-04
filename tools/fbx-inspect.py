#!/usr/bin/env python3
"""Read an FBX binary and report its axis settings and mesh extents.

Written because "the gun points the wrong way" is not diagnosable by reading the
Blender export flags — the only ground truth is what actually landed in the file.
Unity converts a file into its own Y-up/Z-forward space using the GlobalSettings
axes below, so those plus the raw vertex extents say exactly what Unity will see.
"""
import struct, sys, zlib, os

def read_u32(f): return struct.unpack('<I', f.read(4))[0]
def read_u64(f): return struct.unpack('<Q', f.read(8))[0]
def read_u8(f):  return struct.unpack('<B', f.read(1))[0]

def read_array(f, kind):
    length, encoding, comp_len = struct.unpack('<III', f.read(12))
    raw = f.read(comp_len)
    if encoding == 1:
        raw = zlib.decompress(raw)
    fmt = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': 'b'}[kind]
    size = struct.calcsize('<' + fmt)
    return list(struct.unpack('<%d%s' % (length, fmt), raw[:length * size]))

def read_property(f):
    t = f.read(1).decode('ascii')
    if t == 'Y': return struct.unpack('<h', f.read(2))[0]
    if t == 'C': return read_u8(f) != 0
    if t == 'I': return struct.unpack('<i', f.read(4))[0]
    if t == 'F': return struct.unpack('<f', f.read(4))[0]
    if t == 'D': return struct.unpack('<d', f.read(8))[0]
    if t == 'L': return struct.unpack('<q', f.read(8))[0]
    if t in 'fdlib': return read_array(f, t)
    if t in ('S', 'R'):
        n = read_u32(f)
        data = f.read(n)
        return data.decode('utf-8', 'replace') if t == 'S' else data
    raise ValueError('unknown property type %r' % t)

def read_node(f, version):
    big = version >= 7500
    end = read_u64(f) if big else read_u32(f)
    num_props = read_u64(f) if big else read_u32(f)
    read_u64(f) if big else read_u32(f)          # property list length
    name_len = read_u8(f)
    if end == 0:
        return None
    name = f.read(name_len).decode('utf-8', 'replace')
    props = [read_property(f) for _ in range(num_props)]
    children = []
    while f.tell() < end:
        child = read_node(f, version)
        if child is None:
            break
        children.append(child)
    f.seek(end)
    return {'name': name, 'props': props, 'children': children}

def walk(node, want, out):
    if node['name'] == want:
        out.append(node)
    for c in node['children']:
        walk(c, want, out)

def inspect(path):
    with open(path, 'rb') as f:
        header = f.read(23)
        if not header.startswith(b'Kaydara FBX Binary'):
            print('%s: not a binary FBX' % path); return
        version = read_u32(f)
        roots = []
        while True:
            node = read_node(f, version)
            if node is None:
                break
            roots.append(node)
            if f.tell() >= os.path.getsize(path) - 160:
                break

    print('\n%s  (FBX %d)' % (os.path.basename(path), version))

    axes = {}
    for root in roots:
        found = []
        walk(root, 'P', found)
        for p in found:
            if p['props'] and isinstance(p['props'][0], str) and 'Axis' in p['props'][0]:
                axes[p['props'][0]] = p['props'][-1]
    order = ['UpAxis', 'UpAxisSign', 'FrontAxis', 'FrontAxisSign', 'CoordAxis', 'CoordAxisSign']
    print('  axes: ' + ', '.join('%s=%s' % (k, axes[k]) for k in order if k in axes))

    for root in roots:
        geoms = []
        walk(root, 'Vertices', geoms)
        for i, g in enumerate(geoms):
            verts = g['props'][0]
            if not verts:
                continue
            xs, ys, zs = verts[0::3], verts[1::3], verts[2::3]
            ex = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
            longest = 'XYZ'[ex.index(max(ex))]
            print('  mesh %d: %d verts   extent X=%.2f Y=%.2f Z=%.2f   longest axis = %s'
                  % (i, len(xs), ex[0], ex[1], ex[2], longest))
            print('           range X[%.2f,%.2f] Y[%.2f,%.2f] Z[%.2f,%.2f]'
                  % (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))

for path in sys.argv[1:]:
    inspect(path)
