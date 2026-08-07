import shutil
import subprocess
import os
import sys

def sync_files():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    www_dir = os.path.join(base_dir, 'www')
    
    os.makedirs(www_dir, exist_ok=True)
    
    files_to_copy = ['index.html', 'renderer.js', 'style.css']
    
    print("🔄 Kopiere Quelldateien nach www/...")
    for filename in files_to_copy:
        src = os.path.join(base_dir, filename)
        dst = os.path.join(www_dir, filename)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f"  ✓ {filename} -> www/{filename}")
        else:
            print(f"  ⚠️ Warnung: {filename} existiert nicht in Root!")

    print("\n📱 Führe 'npx cap sync android' aus...")
    env = os.environ.copy()
    node22_path = "/home/brawllaunchchannel/.nvm/versions/node/v22.22.3/bin"
    if os.path.exists(node22_path):
        env["PATH"] = f"{node22_path}:{env.get('PATH', '')}"
        
    try:
        res = subprocess.run(['npx', 'cap', 'sync', 'android'], cwd=base_dir, check=True, env=env)
        print("✅ Sync zu Capacitor Android erfolgreich abgeschlossen!")
        
        # Auto-copy freshly built APK to Desktop if present
        apk_src = os.path.join(base_dir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
        desktop_apk = os.path.expanduser('~/Schreibtisch/StreamHub-debug.apk')
        if os.path.exists(apk_src):
            shutil.copy2(apk_src, desktop_apk)
            print(f"📦 Aktuelles APK automatisch nach {desktop_apk} kopiert!")
    except Exception as e:
        print(f"❌ Fehler bei Capacitor Sync: {e}")

if __name__ == '__main__':
    sync_files()

