package netguard

import (
	"errors"
	"net"
	"net/netip"
	"testing"
)

func TestIPIsInternal(t *testing.T) {
	cases := map[string]bool{
		// loopback
		"127.0.0.1":       true,
		"127.255.255.254": true,
		"::1":             true,
		// RFC1918 and IPv6 ULA
		"10.0.0.1":       true,
		"172.16.0.1":     true,
		"172.31.255.255": true,
		"192.168.1.10":   true,
		"fc00::1":        true,
		"fd12:3456::1":   true,
		// link-local, cloud metadata
		"169.254.169.254": true,
		"169.254.0.1":     true,
		"fe80::1":         true,
		// this-network, unspecified
		"0.0.0.0": true,
		"0.1.2.3": true,
		"::":      true,
		// CGNAT, benchmarking, reserved, broadcast
		"100.64.0.1":      true,
		"100.100.100.200": true,
		"198.18.0.1":      true,
		"240.0.0.1":       true,
		"255.255.255.255": true,
		// multicast
		"224.0.0.1": true,
		"ff02::1":   true,
		// NAT64 wrapping an internal IPv4
		"64:ff9b::7f00:1": true,
		// IPv4-mapped IPv6 wrapping an internal IPv4
		"::ffff:127.0.0.1":   true,
		"::ffff:10.0.0.1":    true,
		"::ffff:192.168.0.1": true,
		// boundaries just outside the private ranges
		"172.15.255.255": false,
		"172.32.0.1":     false,
		"100.63.255.255": false,
		"100.128.0.1":    false,
		// public
		"8.8.8.8":              false,
		"1.1.1.1":              false,
		"93.184.216.34":        false,
		"2606:4700:4700::1111": false,
		"::ffff:8.8.8.8":       false,
	}
	for ip, want := range cases {
		t.Run(ip, func(t *testing.T) {
			parsed := net.ParseIP(ip)
			if parsed == nil {
				t.Fatalf("bad test address %q", ip)
			}
			if got := IPIsInternal(parsed); got != want {
				t.Errorf("IPIsInternal(%s) = %v, want %v", ip, got, want)
			}
		})
	}
}

func TestHostIsInternalWithoutDns(t *testing.T) {
	cases := map[string]bool{
		"":                 true,
		"localhost":        true,
		"LOCALHOST":        true,
		"localhost.":       true,
		"foo.localhost":    true,
		"a.b.localhost.":   true,
		"127.0.0.1":        true,
		"::1":              true,
		"169.254.169.254":  true,
		"10.1.2.3":         true,
		"8.8.8.8":          false,
		"2606:4700::1111":  false,
		"::ffff:127.0.0.1": true,
	}
	for host, want := range cases {
		t.Run(host, func(t *testing.T) {
			if got := HostIsInternal(host); got != want {
				t.Errorf("HostIsInternal(%q) = %v, want %v", host, got, want)
			}
		})
	}
}

func TestPublicOnly(t *testing.T) {
	cases := map[string]bool{ // value: blocked
		"127.0.0.1:80":               true,
		"[::1]:443":                  true,
		"192.168.1.1:8080":           true,
		"[fe80::1]:80":               true,
		"[::ffff:10.0.0.1]:80":       true,
		"8.8.8.8:443":                false,
		"[2606:4700:4700::1111]:443": false,
	}
	for addr, blocked := range cases {
		t.Run(addr, func(t *testing.T) {
			err := PublicOnly(netip.MustParseAddrPort(addr))
			if blocked && !errors.Is(err, ErrInternalAddress) {
				t.Errorf("PublicOnly(%s) = %v, want ErrInternalAddress", addr, err)
			}
			if !blocked && err != nil {
				t.Errorf("PublicOnly(%s) = %v, want nil", addr, err)
			}
		})
	}
}

func TestControl(t *testing.T) {
	control := Control(nil)

	if err := control("tcp4", "127.0.0.1:80", nil); !errors.Is(err, ErrInternalAddress) {
		t.Errorf("loopback: got %v, want ErrInternalAddress", err)
	}
	if err := control("tcp", "93.184.216.34:443", nil); err != nil {
		t.Errorf("public address: got %v, want nil", err)
	}
	if err := control("udp", "93.184.216.34:443", nil); !errors.Is(err, ErrInternalAddress) {
		t.Errorf("non-tcp network must be refused, got %v", err)
	}
	// The dialer hands Control a resolved ip:port; anything else is refused rather than guessed at.
	if err := control("tcp", "example.com:443", nil); !errors.Is(err, ErrInternalAddress) {
		t.Errorf("unresolved host: got %v, want ErrInternalAddress", err)
	}
	if err := control("tcp", "not an address", nil); !errors.Is(err, ErrInternalAddress) {
		t.Errorf("garbage: got %v, want ErrInternalAddress", err)
	}
}

func TestControlUsesTheInjectedGuard(t *testing.T) {
	var seen netip.AddrPort
	control := Control(func(addr netip.AddrPort) error {
		seen = addr
		return nil
	})
	if err := control("tcp4", "127.0.0.1:4242", nil); err != nil {
		t.Fatalf("an injected allow-all guard must win: %v", err)
	}
	if seen.Port() != 4242 {
		t.Errorf("guard saw port %d, want 4242", seen.Port())
	}
}
