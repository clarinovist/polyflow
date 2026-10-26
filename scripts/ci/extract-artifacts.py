"""Extract digest-verified GitHub ZIPs without the deprecated Node unzip stack.

Run only AFTER download-artifact succeeds with skip-decompress=true and its
(default) digest-mismatch=error. Preserve its single/multi-artifact directories.
"""
import shutil
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath

MAX_EXPANDED_BYTES = 2 * 1024**3


def plan_archive(archive):
    with zipfile.ZipFile(archive) as bundle:
        entries = tuple(bundle.infolist())
        if not entries:
            raise ValueError("empty artifact ZIP")
        targets = tuple(archive.parent / entry.filename for entry in entries)
        for entry, target in zip(entries, targets):
            name = PurePosixPath(entry.filename)
            kind = stat.S_IFMT(entry.external_attr >> 16)
            if (name.is_absolute() or ".." in name.parts or "\\" in entry.filename
                    or not name.parts or entry.flag_bits & 1
                    or kind not in (0, stat.S_IFREG, stat.S_IFDIR)):
                raise ValueError("unsafe or unsupported ZIP member")
            if not target.resolve().is_relative_to(archive.parent.resolve()):
                raise ValueError("ZIP member escapes its artifact directory")
            if target.exists() or target.is_symlink():
                raise ValueError("ZIP member would overwrite an existing path")
        files = frozenset(target for entry, target in zip(entries, targets) if not entry.is_dir())
        if len(set(targets)) != len(targets) or any(parent in files for target in targets for parent in target.parents):
            raise ValueError("conflicting ZIP member paths")
        if sum(entry.file_size for entry in entries) > MAX_EXPANDED_BYTES:
            raise ValueError("artifact expands beyond the 2 GiB safety limit")
        if bundle.testzip() is not None:
            raise ValueError("ZIP checksum mismatch")
        return entries


def extract_artifacts(directory):
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("artifact directory must be a real directory")
    paths = tuple(directory.rglob("*"))
    if any(path.is_symlink() for path in paths):
        raise ValueError("artifact directory contains a symlink")
    archives = tuple(sorted(path for path in paths if path.is_file()))
    if not archives:
        raise ValueError("no downloaded artifacts")
    parents = frozenset(archive.parent for archive in archives)
    if (len(parents) != len(archives) or (directory in parents and len(parents) > 1)
            or any(len(archive.relative_to(directory).parts) > 2 for archive in archives)):
        raise ValueError("unexpected mixed artifact layout")
    # Validate EVERY archive before writing any output.
    plans = tuple((archive, plan_archive(archive)) for archive in archives)
    for archive, entries in plans:
        with zipfile.ZipFile(archive) as bundle:
            for entry in entries:
                target = archive.parent / entry.filename
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.open(entry) as source, target.open("xb") as output:
                        shutil.copyfileobj(source, output)
    for archive in archives:
        archive.unlink()
    print(f"Extracted {len(archives)} artifact ZIP(s); member CRC checks passed.")


def main():
    if len(sys.argv) != 2:
        print("Usage: extract-artifacts.py DIRECTORY", file=sys.stderr)
        return 2
    try:
        extract_artifacts(Path(sys.argv[1]))
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Artifact extraction failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
