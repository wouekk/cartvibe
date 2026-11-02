// Package netguard decides whether an address is one the server must never reach on a user's behalf (the NAS and
// its LAN, loopback, cloud metadata). Every outbound fetch of a user-chosen URL goes through it.
package netguard

import (
	"errors"
	"net"
	"net/netip"
	"strings"
	"syscall"
)

// ErrInternalAddress is returned by Guard and Control for a refused address. It deliberately says nothing about
// which range matched.
var ErrInternalAddress = errors.New("address is not publicly routable")

// Guard vets one resolved address and port right before a connection is made.
type Guard func(netip.AddrPort) error

// extraInternalNets are non-public ranges the stdlib IP predicates below do not
// cover but can still be routed to: "this network" (0.0.0.0/8, some of which
// maps to local services on Linux), CGNAT (100.64.0.0/10 — Alibaba Cloud metadata
// lives at 100.100.100.200), benchmarking (198.18.0.0/15), reserved + broadcast
// (240.0.0.0/4, which includes 255.255.255.255) and NAT64 (64:ff9b::/96, which
// maps onto internal IPv4 on NAT64 networks).
var extraInternalNets = mustParseCIDRs(
	"0.0.0.0/8",
	"100.64.0.0/10",
	"198.18.0.0/15",
	"240.0.0.0/4",
	"64:ff9b::/96",
)

// mustParseCIDRs parses the given CIDRs at init and panics on a malformed one —
// they are compile-time constants, so a bad entry is a programmer error.
func mustParseCIDRs(cidrs ...string) []*net.IPNet {
	nets := make([]*net.IPNet, 0, len(cidrs))
	for _, cidr := range cidrs {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			panic("netguard: invalid internal CIDR " + cidr + ": " + err.Error())
		}
		nets = append(nets, network)
	}
	return nets
}

// IPIsInternal reports whether an IP is one that must never be reached: loopback
// (127/8, ::1), RFC1918 / IPv6 ULA (via IsPrivate), link-local unicast/multicast
// (169.254/16 incl. cloud metadata, fe80::/10), any multicast, unspecified
// (0.0.0.0, ::), or one of the extraInternalNets ranges above. An IPv4-mapped
// IPv6 address is judged as the IPv4 address it wraps.
func IPIsInternal(ip net.IP) bool {
	for _, network := range extraInternalNets {
		if network.Contains(ip) {
			return true
		}
	}
	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified()
}

// HostIsInternal reports whether a request host points at a loopback, private,
// link-local (incl. 169.254.169.254 cloud metadata) or unspecified address.
// Hostnames are resolved and treated as internal if ANY resolved address is, or
// if resolution fails (fail closed). NOTE: the address is checked at decision
// time; a host that rebinds to an internal IP between this check and the real
// connection could still slip through, which is why a fetcher also installs
// Control on its dialer (it sees the address actually being connected to).
func HostIsInternal(host string) bool {
	// Normalize case and a trailing FQDN dot before matching. Chromium resolves
	// "localhost" and every "*.localhost" name to loopback itself without asking
	// DNS, so those must be refused by name — a resolver that returned a public
	// address for "foo.localhost" would not change where chromium connects.
	h := strings.TrimSuffix(strings.ToLower(host), ".")
	if h == "" || h == "localhost" || strings.HasSuffix(h, ".localhost") {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return IPIsInternal(ip)
	}
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return true
	}
	for _, ip := range ips {
		if IPIsInternal(ip) {
			return true
		}
	}
	return false
}

// PublicOnly is the production Guard: it refuses every internal address.
func PublicOnly(addr netip.AddrPort) error {
	ip := addr.Addr()
	if !ip.IsValid() || IPIsInternal(net.IP(ip.AsSlice())) {
		return ErrInternalAddress
	}
	return nil
}

// Control returns a net.Dialer.Control hook that applies guard to the address the
// dialer is about to connect to. It runs after DNS resolution, for every
// connection (including each redirect hop and each address tried), so DNS
// rebinding and a redirect to an internal host cannot get past it. A nil guard
// means PublicOnly.
func Control(guard Guard) func(network, address string, c syscall.RawConn) error {
	if guard == nil {
		guard = PublicOnly
	}
	return func(network, address string, _ syscall.RawConn) error {
		switch network {
		case "tcp", "tcp4", "tcp6":
		default:
			return ErrInternalAddress
		}
		addr, err := netip.ParseAddrPort(address)
		if err != nil {
			return ErrInternalAddress
		}
		return guard(addr)
	}
}
