"""Package the existing npm tarball with macOS Bash launchers (Python stdlib only)."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import stat
import tarfile
import zipfile


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    version = package["version"]
    if package["name"] != "dsh-chat-bridge" or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?", version):
        raise SystemExit("Unexpected package identity")
    filename = f"dsh-chat-bridge-{version}.tgz"
    tarball = root / "dist" / filename
    # Refuse a stale or mismatched package before writing the sharing archive.
    with tarfile.open(tarball, "r:gz") as archive:
        member = archive.getmember("package/package.json")
        if not member.isfile() or member.size > 1024 * 1024:
            raise SystemExit("Invalid package manifest")
        source = archive.extractfile(member)
        if source is None:
            raise SystemExit("Missing package manifest")
        packed = json.load(source)
        if packed["name"] != package["name"] or packed["version"] != version:
            raise SystemExit("Build and npm pack the current version first")
        for member in archive.getmembers():
            if member.issym() or member.islnk() or member.name.endswith((".node", ".dll", ".exe", ".dylib")):
                raise SystemExit("This sharing package expects a portable JavaScript plugin")

    content = tarball.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    folder = f"dsh-chat-bridge-{version}-macos"
    output = root / "dist" / f"{folder}.zip"
    entries: list[tuple[str, bytes, int]] = [(filename, content, 0o644)]
    for name in ("install.command", "remove.command", "manage-plugin.sh"):
        script = (root / "distribution" / "macos" / name).read_text(encoding="utf-8")
        if name == "manage-plugin.sh":
            if script.count("__PLUGIN_TARBALL__") != 1 or script.count("__PLUGIN_SHA256__") != 1:
                raise SystemExit("Unexpected launcher placeholders")
            script = script.replace("__PLUGIN_TARBALL__", filename).replace("__PLUGIN_SHA256__", digest)
        entries.append((name, script.replace("\r\n", "\n").encode("utf-8"), 0o755))
    entries.append(("README-MACOS.md", (root / "docs" / "MACOS.md").read_bytes(), 0o644))
    entries.append(("SHA256SUMS", f"{digest}  {filename}\n".encode("ascii"), 0o644))
    for name in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
        entries.append((name, (root / name).read_bytes(), 0o644))
    with zipfile.ZipFile(output, "w") as sharing:
        for name, data, mode in entries:
            info = zipfile.ZipInfo(f"{folder}/{name}")
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | mode) << 16
            info.compress_type = zipfile.ZIP_STORED if name.endswith(".tgz") else zipfile.ZIP_DEFLATED
            sharing.writestr(info, data)
    print(json.dumps({"path": str(output), "files": len(entries), "bytes": output.stat().st_size,
                      "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "tarballSha256": digest}, indent=2))


if __name__ == "__main__":
    main()
