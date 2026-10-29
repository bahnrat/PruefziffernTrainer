"""Baut alle HTML-Fassungen aus den Einzelteilen."""
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
r = lambda f: open(f, encoding='utf-8').read()
def build(shell, out, app, backend=None):
    t = r(shell)
    for slot, f in [('/*CORE*/', 'core.js'), ('/*PIN*/', 'pin.js'), ('/*EXPLAIN*/', 'explain.js'), ('/*APP*/', app)]:
        t = t.replace(slot, r(f))
    if backend:
        t = t.replace('/*DATA*/', r('data.js')).replace('/*BACKEND*/', r(backend))
    open(out, 'w', encoding='utf-8').write(t)
    print('gebaut:', out)
build('shell.html', 'Pruefziffer-Trainer.html', 'app.js')
build('shell-net.html', 'Pruefziffer-Trainer-Netz.html', 'app-net.js', 'backend-fs.js')
build('shell-server.html', 'index.html', 'app-net.js', 'backend-http.js')
