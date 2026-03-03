SELECT column_name, data_type FROM information_schema.columns WHERE table_name='lbs_50k_nasional' ORDER BY ordinal_position;
SELECT table_name, pg_size_pretty(pg_total_relation_size(table_name::regclass)) AS size FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('lbs_50k_nasional','lsd_50k_dilindungi');
