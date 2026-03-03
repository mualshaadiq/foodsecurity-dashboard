import urllib.request
import mapbox_vector_tile
import gzip

url = 'http://localhost:8080/maps/food_monitoring/10/827/533.pbf'
req = urllib.request.Request(url)
r = urllib.request.urlopen(req)
raw = r.read()
print('HTTP status:', r.status)
print('Content-Encoding:', r.headers.get('Content-Encoding', 'none'))
print('Content-Type:', r.headers.get('Content-Type', 'unknown'))
print('Response size (bytes):', len(raw))
# Try gzip decompression if needed
data = raw
if r.headers.get('Content-Encoding') == 'gzip' or (len(raw) > 2 and raw[:2] == b'\x1f\x8b'):
    data = gzip.decompress(raw)
    print('Decompressed size:', len(data))
tile = mapbox_vector_tile.decode(data)
print('Layers found:', list(tile.keys()))
for layer, ldata in tile.items():
    count = len(ldata['features'])
    print(layer + ': ' + str(count) + ' features')
