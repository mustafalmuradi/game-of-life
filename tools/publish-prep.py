#!/usr/bin/env python3
"""Build dist/ from src/ for publishing to the artifact.

src/index.html is a complete document (it runs standalone and in the harness).
The Artifact tool wraps the page in its own skeleton at publish time, so the
published copy carries only the content: from <title> to the module script tag.
Everything else is copied as is.
"""
import os, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, DIST = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'dist')
SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n'
html = open(os.path.join(SRC, 'index.html'), encoding='utf-8').read()
assert html.startswith(SKELETON), 'src/index.html no longer starts with the publish skeleton'
assert html.rstrip().endswith('</body></html>'), 'src/index.html no longer ends with </body></html>'
content = html[len(SKELETON):].rstrip()[:-len('</body></html>')].rstrip() + '\n'
shutil.rmtree(DIST, ignore_errors=True)
for sub in ('css', 'js', 'tools'):
    shutil.copytree(os.path.join(SRC, sub), os.path.join(DIST, sub))
open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8').write(content)
files = sorted(os.path.relpath(os.path.join(d, f), DIST) for d, _, fs in os.walk(DIST) for f in fs)
print('dist/ ready:', len(files), 'files;', 'index.html', len(content), 'bytes, starts with', repr(content[:30]))
for f in files: print('  ', f)
