import geopandas as gpd, warnings
warnings.filterwarnings('ignore')
gdf = gpd.read_file(r'C:/Repo/opengridindo/data/shapefiles/Food Monitoring/LSD_50K_Dilindungi_part1.shp', rows=1)
print("COLUMNS:", list(gdf.columns))
print("DTYPES:\n", gdf.dtypes)
