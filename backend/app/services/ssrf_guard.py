"""
app/services/ssrf_guard.py — HouseMind

SEC-02 fix: Server-Side Request Forgery (SSRF) guard.

The scrape endpoint at GET /products/scrape-images allowed an architect to
supply any URL — including http://169.254.169.254/latest/meta-data/ (AWS
instance metadata service) — and the server would fetch it, potentially
returning IAM credentials, environment variables, or internal service data.

validate_url_against_ssrf():
  1. Enforces https-only scheme (http blocked in production).
  2. Resolves all IP addresses for the hostname.
  3. Rejects any IP in RFC 1918, loopback, link-local, or reserved ranges.
  4. The check covers both IPv4 and IPv6.

The DNS resolution happens at validation time.  If the hostname later resolves
to a different IP (DNS rebinding attack), httpx's connect timeout (8s) limits
the blast radius.  For stronger protection, use a forward proxy that enforces
the same IP blocklist at the network level.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException, status

# Ranges that must never be reachable from user-supplied URLs.
_BLOCKED_NETWORKS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    # Loopback
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    # RFC 1918 private
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    # Link-local — covers AWS EC2 instance metadata (169.254.169.254)
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("fe80::/10"),
    # IPv6 ULA (private)
    ipaddress.ip_network("fc00::/7"),
    # Multicast
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("ff00::/8"),
    # Reserved / this network
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),  # RFC 6598 shared address space
    ipaddress.ip_network("192.0.0.0/24"),   # IETF protocol assignments
    ipaddress.ip_network("192.0.2.0/24"),   # TEST-NET-1
    ipaddress.ip_network("198.18.0.0/15"),  # benchmark testing
    ipaddress.ip_network("198.51.100.0/24"), # TEST-NET-2
    ipaddress.ip_network("203.0.113.0/24"), # TEST-NET-3
    ipaddress.ip_network("240.0.0.0/4"),    # reserved
]


def validate_url_against_ssrf(url: str, require_https: bool = True) -> str:
    """
    Validate that `url` does not target a private or internal address.

    Args:
        url: The URL to validate (user-supplied).
        require_https: If True (default in production), reject plain http.

    Returns:
        The original URL string if it passes all checks.

    Raises:
        HTTPException 422: scheme not allowed or hostname resolves to blocked IP.
        HTTPException 502: hostname does not resolve.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid URL format",
        )

    if require_https and parsed.scheme not in ("https",):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only https:// URLs are allowed for external requests",
        )
    elif not require_https and parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only http/https URLs are allowed",
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="URL must include a hostname",
        )

    # Resolve all addresses (handles both A and AAAA records)
    try:
        addr_infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Cannot resolve hostname '{hostname}': {exc}",
        )

    if not addr_infos:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Hostname '{hostname}' resolved to no addresses",
        )

    for _family, _type, _proto, _canonname, sockaddr in addr_infos:
        raw_ip = sockaddr[0]
        try:
            ip = ipaddress.ip_address(raw_ip)
        except ValueError:
            continue

        for network in _BLOCKED_NETWORKS:
            if ip in network:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"URL resolves to a blocked address range. "
                        f"External service URLs must be publicly routable."
                    ),
                )

    return url
