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
    
    root /var/www/chaos-map;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### Directory Structure for Deployment

```
/var/www/chaos-map/          # Or any web server root
├── index.html               # Landing page
├── index.css                # Landing page styles
├── chaos-map.html           # Main application
├── js/
│   ├── main.js              # Entry point
│   ├── constants.js         # Configuration
│   ├── chaos-renderer.js    # Main renderer
│   ├── chaos-renderer-*.js  # Renderer modules
│   ├── cpu-physics.js       # Physics calculations
│   ├── pendulum-sim-cpu.js  # Pendulum simulation
│   └── transform.js         # Math utilities
└── assets/
    ├── chaos-map-example.png
    └── skeu-textures/       # UI textures
        └── *.png
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

1. Copy all files to web server root
2. Ensure proper MIME types for `.js` and `.css` files
3. No build step required - serve files as-is
4. Optional: Enable gzip compression for faster loading

## GitHub Pages

The project can be deployed to GitHub Pages:
- Push to `main` branch
- Enable GitHub Pages in repository settings
- Access at `https://username.github.io/repo-name/chaos-map.html`
