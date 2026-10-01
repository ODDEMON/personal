#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
无头冒烟测试的统一入口（可选，运行作品本身不需要它）。

前置：在仓库根目录执行一次 `npm install`（只装 jsdom）。
      Node.js 18+ 即可，仅在跑测试时需要。

用法：
    python run-tests.py            # 跑全部四个
    python run-tests.py game proof # 只跑指定的
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
# hub = 总台（入口页），它的冒烟测试不在子目录里，单独指一条路径
PROJECTS = ["hub", "game", "proof", "the-visitor-protocol", "oddemon-typo"]
HUB_TEST = os.path.join(ROOT, "test", "hub.mjs")


def main():
    wanted = sys.argv[1:]
    if wanted:
        for name in wanted:
            if name not in PROJECTS:
                print("[X] unknown project: %s" % name)
                print("    available: %s" % ", ".join(PROJECTS))
                return 1
        targets = wanted
    else:
        targets = PROJECTS

    node = shutil.which("node") or shutil.which("node.exe")
    if not node:
        print("[X] Node.js not found. It is only needed to run the tests.")
        print("    https://nodejs.org/")
        return 1

    if not os.path.isdir(os.path.join(ROOT, "node_modules", "jsdom")):
        print("[X] jsdom is not installed. Run this once in the repo root:")
        print("      npm install")
        return 1

    failed = []
    for name in targets:
        smoke = HUB_TEST if name == "hub" else os.path.join(ROOT, name, "test", "smoke.mjs")
        if not os.path.isfile(smoke):
            print("\n==== %s ====" % name)
            print("[!] no smoke test found, skipped")
            continue
        print("\n==== %s ====" % name)
        r = subprocess.run([node, smoke], cwd=ROOT)
        if r.returncode != 0:
            failed.append(name)

    print("\n" + "=" * 40)
    if failed:
        print("FAILED: %s" % ", ".join(failed))
        return 1
    print("ALL PASSED: %s" % ", ".join(targets))
    return 0


if __name__ == "__main__":
    sys.exit(main())
