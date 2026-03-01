# Chaos Map - AGENTS.md

## Project Overview

Chaos Map is an interactive WebGL-based visualization tool for exploring chaotic behavior in double pendulum systems. It generates "chaos maps" that visualize how quickly two nearly identical double pendulums diverge from each other.

## Deployment Requirements

### Web Server

- **Type**: Any static file server (Nginx, Apache, or simple HTTP server)
- **Protocol**: HTTP or HTTPS
- **No server-side processing required** - fully client-side application

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name localhost;
    
    root /var/www/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### Directory Structure for Deployment

```
/var/www/html/
├── index.html               # Landing page (links to all projects)
├── index.css                # Landing page styles
├── chaos-map/               # THIS PROJECT
│   ├── chaos-map.html       # Main application
│   ├── js/
│   │   ├── main.js
│   │   ├── constants.js
│   │   ├── chaos-renderer.js
│   │   ├── chaos-renderer-*.js
│   │   ├── cpu-physics.js
│   │   ├── pendulum-sim-cpu.js
│   │   └── transform.js
│   └── assets/
│       ├── chaos-map-example.png
│       └── skeu-textures/*.png
├── lyapunovLoupe/           # FTLE platform (sibling project)
└── dot-dodger/              # Game (sibling project)
```

### Browser Requirements

- WebGL support (WebGL 1.0 or 2.0)
- JavaScript ES6+ support
- Tested on: Chrome, Firefox, Safari, Edge

### Performance Notes

- GPU mode uses WebGL fragment shaders for parallel computation
- CPU mode uses Web Workers for 64-bit precision calculations
- Supports resolutions from 256x256 to 4096x4096 pixels

## Local Development

To serve locally for testing:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js (npx)
npx serve .

# Using PHP
php -S localhost:8000
```

## Production Deployment

```bash
# Copy to nginx serve directory
cp -r chaos-map/ /var/www/html/
cp index.html /var/www/html/
cp index.css /var/www/html/
```

No build step required - serve files as-is.

## GitHub Pages

The project is deployed to GitHub Pages:
- **Repo**: `git@github.com:Antelling/Chaos-Map.git`
- **Access**: `https://antelling.github.io/Chaos-Map/chaos-map/chaos-map.html`
