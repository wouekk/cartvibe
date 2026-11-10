package routers

import (
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"gopkg.in/yaml.v3"
)

// swagger.yml is written by hand, and the web app's client is generated from it. A route the router serves and the
// contract does not name has no client; a route the contract names and the router does not serve is a call that
// can only fail. This test lists both, so neither can appear unnoticed.

// routesOutsideTheContract are served on purpose without being in swagger.yml: they are not called through the
// generated client. Every entry says why.
var routesOutsideTheContract = map[string]string{
	"POST /logout": "kept for a page loaded before 0.19, whose refresh cookie still has the path /; the contract's sign-out is POST /token/logout (logout.go)",
}

var pathParameter = regexp.MustCompile(`\{[^}]*\}`)

// A parameter's name is the handler's business ({id} here, {receiptId} there), and so is a trailing slash.
func contractKey(method string, path string) string {
	path = pathParameter.ReplaceAllString(path, "{}")
	path = strings.TrimSuffix(path, "/")
	return strings.ToUpper(method) + " " + path
}

func TestTheRouterAndTheContractNameTheSameRoutes(t *testing.T) {
	served := map[string]bool{}
	err := chi.Walk(BuildRootRouter(), func(method string, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		// The contract's server is /api; what is mounted beside it (OAuth, MCP, the well-known files) has its own
		// tests (mcp_routes_test.go).
		if !strings.HasPrefix(route, "/api/") {
			return nil
		}
		served[contractKey(method, strings.TrimPrefix(route, "/api"))] = true
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	content, err := os.ReadFile("../../swagger.yml")
	if err != nil {
		t.Fatal(err)
	}
	var contract struct {
		Paths map[string]map[string]yaml.Node `yaml:"paths"`
	}
	if err := yaml.Unmarshal(content, &contract); err != nil {
		t.Fatal(err)
	}

	named := map[string]bool{}
	for path, operations := range contract.Paths {
		for method := range operations {
			switch strings.ToUpper(method) {
			case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
				named[contractKey(method, path)] = true
			}
		}
	}

	var unnamed, unserved []string
	for route := range served {
		if !named[route] && routesOutsideTheContract[route] == "" {
			unnamed = append(unnamed, route)
		}
	}
	for route := range named {
		if !served[route] {
			unserved = append(unserved, route)
		}
	}
	for route := range routesOutsideTheContract {
		if !served[route] || named[route] {
			t.Errorf("%s is listed as outside the contract, but is no longer served or is in swagger.yml now: drop the entry", route)
		}
	}
	sort.Strings(unnamed)
	sort.Strings(unserved)

	if len(unnamed) > 0 {
		t.Errorf("served, but not in swagger.yml (add the operation, or list it in routesOutsideTheContract with a reason):\n  %s", strings.Join(unnamed, "\n  "))
	}
	if len(unserved) > 0 {
		t.Errorf("in swagger.yml, but not served (remove the operation, or route it):\n  %s", strings.Join(unserved, "\n  "))
	}
}
