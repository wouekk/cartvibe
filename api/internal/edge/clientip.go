package edge

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// The networks whose word is taken for who the visitor is: a reverse proxy on the same machine or the home
// network (the Synology proxy, Caddy in the VPS stack). A request that arrives from a public address keeps that
// address whatever header it sends, so nobody outside can name another visitor as the sender.
var trustedProxies = []netip.Prefix{
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("fc00::/7"),
}

func isTrustedProxy(address netip.Addr) bool {
	for _, network := range trustedProxies {
		if network.Contains(address) {
			return true
		}
	}
	return false
}

// ClientIP is the visitor's address: the connection's own, or, when that is a trusted proxy, the last address in
// X-Forwarded-For that is not one (each proxy appends the address it heard from, so the list is read from its
// end). When every address in the list is a trusted proxy the first one is the visitor: someone on the home
// network. The zero Addr is returned when the connection's address cannot be read.
func ClientIP(r *http.Request) netip.Addr {
	peer, ok := parseAddress(r.RemoteAddr)
	if !ok {
		return netip.Addr{}
	}
	if !isTrustedProxy(peer) {
		return peer
	}

	client := peer
	forwarded := strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",")
	for index := len(forwarded) - 1; index >= 0; index-- {
		address, ok := parseAddress(strings.TrimSpace(forwarded[index]))
		if !ok {
			// Nothing to the left of an entry that is not an address can be believed.
			break
		}
		client = address
		if !isTrustedProxy(address) {
			break
		}
	}
	return client
}

// parseAddress reads "1.2.3.4", "1.2.3.4:5678", "::1" or "[::1]:5678".
func parseAddress(text string) (netip.Addr, bool) {
	if text == "" {
		return netip.Addr{}, false
	}
	if host, _, err := net.SplitHostPort(text); err == nil {
		text = host
	}
	address, err := netip.ParseAddr(strings.Trim(text, "[]"))
	if err != nil {
		return netip.Addr{}, false
	}
	return address.Unmap().WithZone(""), true
}

// limitKey is what a visitor is counted under: an IPv4 address, or the /64 an IPv6 address is in (one household's
// router hands a whole /64 to its devices, and one device changes its address within it at will).
func limitKey(address netip.Addr) string {
	if !address.IsValid() {
		return "unknown"
	}
	if address.Is4() {
		return address.String()
	}
	prefix, err := address.Prefix(64)
	if err != nil {
		return address.String()
	}
	return prefix.Masked().String()
}
