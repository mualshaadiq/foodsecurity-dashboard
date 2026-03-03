"""Fetch a food_monitoring tile and decode it to check layer names and feature counts."""
import urllib.request, gzip

url = "http://localhost:8080/maps/food_monitoring/10/827/533.pbf"
print(f"Fetching {url} ...")
req = urllib.request.Request(url, headers={"Accept-Encoding": "identity"})
with urllib.request.urlopen(req, timeout=30) as r:
    data = r.read()
    encoding = r.headers.get("Content-Encoding", "none")
    content_type = r.headers.get("Content-Type", "unknown")
    print(f"Content-Encoding: {encoding}, Content-Type: {content_type}")

print(f"Raw size: {len(data):,} bytes, first 4 bytes: {data[:4].hex()}")

# Detect and decompress gzip
if data[:2] == b'\x1f\x8b':
    print("Detected gzip, decompressing...")
    data = gzip.decompress(data)
    print(f"Decompressed size: {len(data):,} bytes")

import mapbox_vector_tile
tile = mapbox_vector_tile.decode(data)
print(f"\nLayers in tile:")
for layer_name, layer in tile.items():
    n = len(layer['features'])
    print(f"  '{layer_name}': {n:,} features")
    if n > 0 and layer_name in ('lsd_50k_dilindungi', 'lbs_50k_nasional'):
        feat = layer['features'][0]
        print(f"    sample props: {feat['properties']}")
