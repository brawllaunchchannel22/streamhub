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

    vendor_src = os.path.join(base_dir, 'vendor')
    vendor_dst = os.path.join(www_dir, 'vendor')
    if os.path.isdir(vendor_src):
        if os.path.exists(vendor_dst):
            shutil.rmtree(vendor_dst)
        shutil.copytree(vendor_src, vendor_dst)
        print("  ✓ vendor/ -> www/vendor/")

    print("\n📱 Führe 'npx cap sync android' aus...")
    env = os.environ.copy()
    nvm_dir = os.path.expanduser("~/.nvm/versions/node")
    if os.path.isdir(nvm_dir):
        versions = sorted(os.listdir(nvm_dir), reverse=True)
        for v in versions:
            candidate_bin = os.path.join(nvm_dir, v, "bin")
            if os.path.isdir(candidate_bin):
                env["PATH"] = f"{candidate_bin}:{env.get('PATH', '')}"
                break
        
    try:
        res = subprocess.run(['npx', 'cap', 'sync', 'android'], cwd=base_dir, check=True, env=env)
        print("✅ Sync zu Capacitor Android erfolgreich abgeschlossen!")
        
        # Auto-copy freshly built APK to Desktop if present
        apk_src = os.path.join(base_dir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
        desktop_dir = os.path.expanduser('~/Schreibtisch') if os.path.isdir(os.path.expanduser('~/Schreibtisch')) else os.path.expanduser('~/Desktop')
        desktop_apk = os.path.join(desktop_dir, 'StreamHub-debug.apk')
        if os.path.exists(apk_src) and os.path.isdir(desktop_dir):
            shutil.copy2(apk_src, desktop_apk)
            print(f"📦 Aktuelles APK automatisch nach {desktop_apk} kopiert!")
    except Exception as e:
        print(f"❌ Fehler bei Capacitor Sync: {e}")

if __name__ == '__main__':
    sync_files()

