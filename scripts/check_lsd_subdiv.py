from sqlalchemy import create_engine, text
e = create_engine("postgresql://gisuser:gispassword123@localhost:5432/gisdb")
with e.connect() as c:
    cols = [r[0] for r in c.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='lsd_50k_dilindungi_subdiv' ORDER BY ordinal_position"
    )).fetchall()]
    print("Columns:", cols)

    n = c.execute(text(
        "SELECT COUNT(*) FROM lsd_50k_dilindungi_subdiv "
        "WHERE geom && ST_MakeEnvelope(107.578,-7.710,108.281,-7.013,4326)"
    )).scalar()
    print(f"Features in Java bbox: {n:,}")

    res = c.execute(text(
        "SELECT MIN(luas_ha), MAX(luas_ha), AVG(luas_ha) FROM lsd_50k_dilindungi_subdiv"
    )).fetchone()
    print(f"luas_ha: min={res[0]:.4f}, max={res[1]:.1f}, avg={res[2]:.4f}")

    # Simulate Tegola query at zoom 10 (luas_ha >= 0.5)
    n2 = c.execute(text(
        "SELECT COUNT(*) FROM lsd_50k_dilindungi_subdiv "
        "WHERE geom && ST_MakeEnvelope(107.578,-7.710,108.281,-7.013,4326) "
        "AND luas_ha >= 0.5"
    )).scalar()
    print(f"Features passing zoom-10 filter (luas_ha>=0.5): {n2:,}")
