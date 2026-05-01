# Plot UI — Cloud Run service.
#
# Serves the React prototype (loaded via Babel-standalone CDN) as static
# files behind nginx. Cloud Run injects PORT at runtime; nginx must listen
# on it, so we template the config from PORT at container start.
#
# Build:  gcloud builds submit --tag us-central1-docker.pkg.dev/<project>/plot/ui:latest .

FROM nginx:1.27-alpine

# Copy the prototype's static assets. Babel + React load from unpkg at
# runtime, so the image stays tiny (a few MB).
COPY Plot.html tokens.js icons.jsx components.jsx screens.jsx \
     app.jsx ios-frame.jsx tweaks-panel.jsx \
     /usr/share/nginx/html/

# Cloud Run sends $PORT (default 8080); nginx defaults to 80. Generate the
# config at start so we listen on whatever Cloud Run hands us.
RUN rm /etc/nginx/conf.d/default.conf

# The shell substitutes $PORT into the template at container boot. Cloud
# Run sets PORT=8080 by default; this also works locally with `docker run
# -p 8080:8080 -e PORT=8080 <image>`.
CMD ["sh", "-c", "cat > /etc/nginx/conf.d/default.conf <<EOF\nserver {\n  listen ${PORT:-8080};\n  root /usr/share/nginx/html;\n  index Plot.html;\n  location / {\n    try_files \\$uri \\$uri/ /Plot.html;\n  }\n  # never cache the entry HTML so frontend tweaks ship instantly\n  location = /Plot.html {\n    add_header Cache-Control \"no-store\";\n  }\n}\nEOF\nexec nginx -g 'daemon off;'"]
