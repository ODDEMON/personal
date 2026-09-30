import os, subprocess

NODE = r'C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
WS = r'C:\Users\Administrator\.workbuddy\binaries\node\workspace\node_modules'
TEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'smoke.mjs')

env = dict(os.environ)
env['NODE_PATH'] = WS

r = subprocess.run([NODE, TEST], capture_output=True, encoding='utf-8', errors='replace', env=env)
print('RC', r.returncode)
print(r.stdout or '')
if r.stderr:
    print('--- STDERR ---')
    print(r.stderr[-4000:])
