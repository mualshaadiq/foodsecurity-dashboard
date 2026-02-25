# Frontend Development

Modern frontend development setup with Vite and pnpm.

## Setup

### Prerequisites
- Node.js 18+ (LTS recommended)
- pnpm (install: `npm install -g pnpm`)

### Installation

```bash
# Install dependencies
pnpm install
```

## Development

### Start Development Server

```bash
# Run dev server with hot reload
pnpm dev
```

This will start the Vite development server at http://localhost:3000 with:
- Hot Module Replacement (HMR)
- API proxy to backend (automatically proxies /api/* to localhost:8000)
- Tile proxy (automatically proxies /tiles/* to localhost:8080)
- Fast refresh on file changes

### Development Workflow

1. **Start backend services** (in project root):
   ```bash
   docker-compose up -d
   ```

2. **Start frontend dev server** (in frontend directory):
   ```bash
   pnpm dev
   ```

3. **Access application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000 (proxied)
   - Tiles: http://localhost:8080 (proxied)

### Build for Production

```bash
# Create optimized production build
pnpm build

# Output will be in dist/ directory
```

### Preview Production Build

```bash
# Build and preview
pnpm build
pnpm preview
```

## Scripts

- `pnpm dev` - Start development server with HMR
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build locally
- `pnpm lint` - Run ESLint on JavaScript files

## Project Structure

```
frontend/
├── index.html          # Main HTML file
├── main.js            # Vite entry point
├── app.js             # Map & application logic
├── auth.js            # Authentication management
├── styles.css         # Styles
├── package.json       # Dependencies
├── vite.config.js     # Vite configuration
└── dist/              # Production build output (gitignored)
```

## Development Features

### Basemap Selection
Choose from multiple basemap styles via the interactive selector card:
- **Esri Dark** (default) - Dark gray canvas optimized for data visualization
- **Esri Streets** - Detailed street map with labels
- **Esri Satellite** - High-resolution satellite imagery
- **OpenStreetMap** - Community-contributed street map
- **Carto Light** - Clean, light-colored minimalist design
- **Carto Dark** - Dark theme for low-light viewing

The basemap selector is located in the top-right corner of the map. Click to expand options and select your preferred basemap.

### Hot Module Replacement (HMR)
Changes to JS/CSS files automatically refresh in browser without full page reload.

### API Proxy
Development server automatically proxies API requests to avoid CORS issues:
- `/api/*` → `http://localhost:8000/api/*`
- `/tiles/*` → `http://localhost:8080/tiles/*`

### Source Maps
Full source maps in development for easier debugging.

### Fast Builds
Vite uses esbuild for lightning-fast builds and HMR.

## VS Code Integration

Recommended extensions:
- ESLint
- Vite
- JavaScript and TypeScript

## Environment Variables

Create `.env.local` for local overrides:

```bash
VITE_API_URL=http://localhost:8000
VITE_TILES_URL=http://localhost:8080
```

Access in code:
```javascript
const apiUrl = import.meta.env.VITE_API_URL || '/api';
```

## Troubleshooting

### Port Already in Use
Change port in `vite.config.js`:
```javascript
server: {
  port: 3001  // Use different port
}
```

### Backend Connection Issues
Ensure backend services are running:
```bash
docker-compose ps
```

### HMR Not Working
1. Check browser console for errors
2. Try hard refresh (Ctrl+F5)
3. Restart dev server

## Production Deployment

The production build (`pnpm build`) creates optimized static files in `dist/`:

1. **Build**: `pnpm build`
2. **Copy dist/** to nginx html directory
3. Or serve via Docker (already configured in docker-compose.yml)

The existing Docker setup automatically serves production files from the frontend directory.

## Performance

- **Development**: Instant HMR, fast refresh
- **Production**: 
  - Code splitting
  - Tree shaking
  - Minification
  - Asset optimization
  - Gzip compression (via nginx)

## Debugging

### Browser DevTools
- Sources tab: View original source with source maps
- Console: Application logs
- Network: API/tile requests
- Application: LocalStorage (auth tokens)

### Vite Inspector
Add to `vite.config.js` for advanced debugging:
```javascript
import { defineConfig } from 'vite';
import Inspect from 'vite-plugin-inspect';

export default defineConfig({
  plugins: [Inspect()]
});
```

---

Happy coding! 🚀
