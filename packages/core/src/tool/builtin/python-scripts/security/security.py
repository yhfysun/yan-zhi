#!/usr/bin/env python3
"""授权范围内的网络安全侦察 / 合规审计工具（Python 版）。

    仅限对「自有资产 / 已签署授权书的目标」使用。本脚本不做任何攻击性动作
    （不含 DoS、未授权爆破、RCE、恶意载荷），仅提供被动侦察与合规审计能力：
      - port_scan    TCP 连接端口扫描（开放端口 + 服务推断）
      - http_headers HTTP 安全响应头审计（HSTS/CSP/X-Frame-Options…）
      - ssl_check    TLS 证书审计（颁发者/有效期/剩余天数/协议）
      - dns_lookup   DNS 记录查询（A/AAAA/CNAME/MX/NS/TXT）
      - subdomain    基于字典的子域发现（仅 DNS 解析，不做请求）

    依赖（打包期预烤，离线可用）：requests、dnspython；socket/ssl 为标准库。
    输出：纯文本摘要，直接作为工具结果返回。

    法律声明：使用者须确保其对该目标拥有合法授权。滥用本工具造成的一切后果
    由使用者自行承担。
"""
from __future__ import annotations

import argparse
import json
import socket
import ssl
import sys
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    requests = None

try:
    import dns.resolver
    import dns.exception
except ImportError:
    dns = None


COMMON_PORTS = {
    21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 53: "dns", 80: "http",
    110: "pop3", 111: "rpcbind", 135: "msrpc", 139: "netbios", 143: "imap",
    443: "https", 445: "smb", 993: "imaps", 995: "pop3s", 1433: "mssql",
    1521: "oracle", 1723: "pptp", 3306: "mysql", 3389: "rdp", 5432: "postgres",
    5900: "vnc", 6379: "redis", 8080: "http-alt", 8443: "https-alt",
    9200: "elasticsearch", 27017: "mongodb",
}

SECURITY_HEADERS = {
    "Strict-Transport-Security": "HSTS（强制 HTTPS）",
    "Content-Security-Policy": "CSP（防 XSS/注入）",
    "X-Frame-Options": "点击劫持防护",
    "X-Content-Type-Options": "MIME 嗅探防护",
    "Referrer-Policy": "引用来源泄露防护",
    "Permissions-Policy": "浏览器特性权限控制",
    "X-XSS-Protection": "旧版 XSS 过滤器（已弃用但仍常见）",
}

# 常见子域字典（保守规模，避免成为爆破工具）
SUBDOMAIN_WORDLIST = [
    "www", "mail", "webmail", "ftp", "api", "dev", "test", "staging", "beta",
    "admin", "portal", "vpn", "remote", "git", "svn", "ns1", "ns2", "mx",
    "cdn", "static", "assets", "blog", "shop", "app", "m", "mobile", "docs",
    "wiki", "jira", "confluence", "grafana", "jenkins", "ci", "auth", "sso",
]


def _parse_ports(spec: str):
    spec = (spec or "common").strip().lower()
    if spec == "common":
        return sorted(COMMON_PORTS.keys())
    out = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        m = __import__("re").match(r"^(\d+)-(\d+)$", part)
        if m:
            lo = max(1, int(m.group(1)))
            hi = min(65535, int(m.group(2)))
            out.update(range(lo, hi + 1))
        else:
            n = int(part)
            if 1 <= n <= 65535:
                out.add(n)
    return sorted(out)


def cmd_port_scan(a):
    host = a.host
    ports = _parse_ports(a.ports)
    timeout = max(min(int(a.timeout or 1500), 10000), 100)
    conc = max(min(int(a.concurrency or 200), 500), 1)
    print("port_scan %s  ports=%d  timeout=%dms  concurrency=%d" % (host, len(ports), timeout, conc))
    open_ports = []

    import threading
    lock = threading.Lock()

    def scan(p):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout / 1000.0)
        try:
            s.connect((host, p))
            with lock:
                open_ports.append(p)
        except Exception:
            pass
        finally:
            s.close()

    idx = 0
    threads = []
    try:
        while idx < len(ports):
            while len(threads) < conc and idx < len(ports):
                t = threading.Thread(target=scan, args=(ports[idx],))
                t.daemon = True
                t.start()
                threads.append(t)
                idx += 1
            for t in threads:
                t.join(0.05)
            threads = [t for t in threads if t.is_alive()]
    except KeyboardInterrupt:
        pass

    open_ports.sort()
    print("OPEN: %d" % len(open_ports))
    for p in open_ports:
        print("  %d/tcp  %s" % (p, COMMON_PORTS.get(p, "unknown")))


def cmd_http_headers(a):
    if requests is None:
        print("Error: 缺少 requests 依赖（打包环境应预烤）")
        return 1
    url = a.url
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    try:
        r = requests.get(url, timeout=float(a.timeout or 10), allow_redirects=True,
                         headers={"User-Agent": "Mozilla/5.0 (compatible; YZSecurityAudit/1.0)"})
    except Exception as e:
        print("Error: 请求失败: %s" % e)
        return 1
    print("URL: %s  status=%d  final=%s" % (url, r.status_code, r.url))
    print("响应头安全审计：")
    present = {}
    for k, v in r.headers.items():
        kl = k.lower()
        if kl in (x.lower() for x in SECURITY_HEADERS):
            present[kl] = v
    for hdr, desc in SECURITY_HEADERS.items():
        got = present.get(hdr.lower())
        if got:
            print("  [OK]    %-28s %s" % (hdr, desc))
        else:
            print("  [MISS]  %-28s %s" % (hdr, desc))
    # 服务器/技术指纹（被动，仅读响应头）
    server = r.headers.get("Server") or r.headers.get("X-Powered-By") or "(未暴露)"
    print("SERVER/STACK: %s" % server)
    return 0


def cmd_ssl_check(a):
    host = a.host
    port = int(a.port or 443)
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, port), timeout=float(a.timeout or 10)) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
                proto = ssock.version()
        print("HOST: %s:%d  protocol=%s" % (host, port, proto))
        subj = dict(x[0] for x in cert.get("subject", []))
        issuer = dict(x[0] for x in cert.get("issuer", []))
        print("SUBJECT CN: %s" % subj.get("commonName", "(无)"))
        print("ISSUER:    %s" % issuer.get("organizationName", issuer.get("commonName", "(无)")))
        nb = cert.get("notBefore")
        na = cert.get("notAfter")
        fmt = "%Y%m%d%H%M%SZ"
        try:
            d_na = datetime.strptime(na, fmt).replace(tzinfo=timezone.utc)
            d_nb = datetime.strptime(nb, fmt).replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            days_left = (d_na - now).days
            print("VALID FROM: %s" % d_nb.date())
            print("VALID TO:   %s" % d_na.date())
            print("REMAINING:  %d 天 %s" % (days_left, "（即将过期！）" if days_left < 30 else ""))
        except Exception as e:
            print("有效期解析失败: %s" % e)
        sans = cert.get("subjectAltName", [])
        if sans:
            print("SAN: %s" % ", ".join(v for _, v in sans))
    except Exception as e:
        print("Error: SSL 审计失败: %s" % e)
        return 1
    return 0


def cmd_dns_lookup(a):
    if dns is None:
        print("Error: 缺少 dnspython 依赖（打包环境应预烤）")
        return 1
    name = a.name
    rdtype = (a.type or "A").upper()
    try:
        answers = dns.resolver.resolve(name, rdtype)
        print("DNS %s %s:" % (name, rdtype))
        for r in answers:
            print("  %s" % r.to_text())
    except dns.resolver.NXDOMAIN:
        print("Error: 域名不存在 (NXDOMAIN): %s" % name)
        return 1
    except dns.exception.DNSException as e:
        print("Error: DNS 查询失败: %s" % e)
        return 1
    return 0


def cmd_subdomain(a):
    if dns is None:
        print("Error: 缺少 dnspython 依赖（打包环境应预烤）")
        return 1
    domain = a.domain
    found = []
    for sub in SUBDOMAIN_WORDLIST:
        fqdn = "%s.%s" % (sub, domain)
        try:
            dns.resolver.resolve(fqdn, "A")
            found.append(fqdn)
            print("  [+] %s" % fqdn)
        except Exception:
            pass
    print("子域发现完成：命中 %d / 候选 %d（仅 DNS 解析，未发起请求）" % (len(found), len(SUBDOMAIN_WORDLIST)))
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(prog="security", description="授权网络安全侦察/审计（Python）")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("port_scan", help="TCP 端口扫描")
    s.add_argument("--host", required=True)
    s.add_argument("--ports", default="common")
    s.add_argument("--timeout", default=1500)
    s.add_argument("--concurrency", default=200)
    s.set_defaults(func=cmd_port_scan)

    s = sub.add_parser("http_headers", help="HTTP 安全头审计")
    s.add_argument("--url", required=True)
    s.add_argument("--timeout", default=10)
    s.set_defaults(func=cmd_http_headers)

    s = sub.add_parser("ssl_check", help="TLS 证书审计")
    s.add_argument("--host", required=True)
    s.add_argument("--port", default=443)
    s.add_argument("--timeout", default=10)
    s.set_defaults(func=cmd_ssl_check)

    s = sub.add_parser("dns_lookup", help="DNS 记录查询")
    s.add_argument("--name", required=True)
    s.add_argument("--type", default="A")
    s.set_defaults(func=cmd_dns_lookup)

    s = sub.add_parser("subdomain", help="子域发现（字典 DNS）")
    s.add_argument("--domain", required=True)
    s.set_defaults(func=cmd_subdomain)

    a = p.parse_args(argv)
    try:
        rc = a.func(a)
    except KeyboardInterrupt:
        print("已中断")
        return 1
    return rc or 0


if __name__ == "__main__":
    raise SystemExit(main())
