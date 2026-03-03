"""Patch import scripts for running inside the fastapi container on prod."""
import re

files = [
    '/tmp/scripts/import_lbs_postgis.py',
    '/tmp/scripts/import_lsd_postgis.py',
]

for fname in files:
    with open(fname) as f:
        content = f.read()

    # Fix DB host
    content = content.replace('localhost:5432', 'postgis:5432')

    # Fix data dir — __file__ is /tmp/scripts/import_*.py, so relative ../data won't work
    content = re.sub(
        r'os\.path\.join\(os\.path\.dirname\(__file__\),\s*"\.\."\s*,\s*"data"\s*,\s*"shapefiles"\s*,\s*"Food Monitoring"\)',
        '"/data/shapefiles/Food Monitoring"',
        content
    )

    # Fix SQLAlchemy 2.x incompatibility: pass connection instead of engine to to_postgis
    content = content.replace(
        'gdf.to_postgis(\n            TABLE,\n            engine,',
        'with engine.begin() as _conn:\n            gdf.to_postgis(\n            TABLE,\n            _conn,'
    )
    # Close the with block by indenting the closing paren
    content = re.sub(
        r'(gdf\.to_postgis\(\n.*?chunksize=5000,\n        \))',
        lambda m: m.group(0).rstrip(')') + ')\n        )',
        content,
        flags=re.DOTALL
    )

    with open(fname, 'w') as f:
        f.write(content)

    print(f"Patched: {fname}")

print("All done.")
