// Local preview: serves src/ at http://localhost:8080 (no dependencies).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'text/xml', '.mp4': 'video/mp4' };
const port = Number(process.env.PORT) || 8080;

createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path === '/' ? 'index.html' : path);
    try {
        // Stream video, including byte ranges, so local preview behaves like MP4 hosting.
        // Do not read an entire video into the preview server's JavaScript heap.
        if (extname(file) === '.mp4') {
            const { size } = await stat(file);
            let start = 0, end = size - 1;
            const range = req.headers.range;
            const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
            if (range) {
                const match = /^bytes=(\d*)-(\d*)$/.exec(range);
                if (match && (match[1] || match[2])) {
                    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
                    end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
                } else start = size;
                if (start >= size || start > end || (!match[1] && Number(match[2]) === 0)) {
                    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
                    res.end();
                    return;
                }
                headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
            }
            headers['Content-Length'] = end - start + 1;
            res.writeHead(range ? 206 : 200, headers);
            if (req.method === 'HEAD') { res.end(); return; }
            const stream = createReadStream(file, { start, end });
            stream.on('error', () => res.destroy());
            res.on('close', () => stream.destroy());
            stream.pipe(res);
            return;
        }
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(body);
    } catch {
        res.writeHead(404);
        res.end();
    }
}).listen(port, () => console.log(`Preview at http://localhost:${port}`));
