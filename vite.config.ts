import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const LAYOUT_FILE = '.justanudge-layout.json';

function justanudgePlugin() {
  let root = '';
  return {
    name: 'justanudge-layout',
    configResolved(config: { root: string }) {
      root = config.root;
    },
    configureServer(server: { middlewares: { use: Function } }) {
      const filePath = () => path.join(root, LAYOUT_FILE);

      // GET - serve the layout file
      server.middlewares.use('/__justanudge/layout', (_req: any, res: any, next: any) => {
        if (_req.method !== 'GET') return next();
        const fp = filePath();
        if (!fs.existsSync(fp)) {
          res.statusCode = 404;
          res.end('{}');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(fs.readFileSync(fp, 'utf-8'));
      });

      // POST - save the layout file
      server.middlewares.use('/__justanudge/save', (req: any, res: any, next: any) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk: string) => { body += chunk; });
        req.on('end', () => {
          try {
            // Validate it's valid JSON
            JSON.parse(body);
            fs.writeFileSync(filePath(), body, 'utf-8');
            res.statusCode = 200;
            res.end('ok');
          } catch {
            res.statusCode = 400;
            res.end('invalid json');
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), justanudgePlugin()],
});
