package oidc

import (
	"sync"
	"testing"

	"cartvibe/api/internal/cell"
	"cartvibe/api/internal/cell/celltest"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

func TestGetProviderCachesDiscovery(t *testing.T) {
	defer teardownOidcTest()
	idp, provider := setupOidcTest(t, oidcTestOptions{})

	// Caching is not an optimization: oidc.NewProvider makes a network round trip
	// every call, and the *oidc.Provider is what holds the cached JWKS, so
	// rebuilding it would refetch the signing keys on every single login.
	if _, err := GetProvider(repositories.ImplicitCell().ID(), provider); err != nil {
		t.Fatalf("first discovery failed: %v", err)
	}

	if _, err := GetProvider(repositories.ImplicitCell().ID(), provider); err != nil {
		t.Fatalf("second discovery failed: %v", err)
	}

	if count := idp.discoveryCount(); count != 1 {
		t.Errorf("expected the discovery document to be fetched once, got %d", count)
	}
}

// TestGetProviderRebuildsWhenTheRowChanges is the property that makes this cache
// correct across replicas without any cross-process invalidation: the row (and so
// its GORM-managed UpdatedAt) is read fresh on every request, so another
// process's edit invalidates the entry by construction.
func TestGetProviderRebuildsWhenTheRowChanges(t *testing.T) {
	defer teardownOidcTest()
	idp, provider := setupOidcTest(t, oidcTestOptions{})

	if _, err := GetProvider(repositories.ImplicitCell().ID(), provider); err != nil {
		t.Fatalf("first discovery failed: %v", err)
	}

	// Simulate an administrator edit landing on another process: only the row's
	// UpdatedAt moves, and this process is handed the fresh row.
	if err := repositories.GetDB().
		Model(&models.OidcProvider{}).
		Where("id = ?", provider.ID).
		Update("display_name", "Renamed").Error; err != nil {
		t.Fatalf("failed to touch the provider: %v", err)
	}

	updated, err := repositories.NewOidcProviderRepository(repositories.ImplicitCell(), nil).GetOidcProviderById(provider.ID)
	if err != nil {
		t.Fatalf("failed to reload the provider: %v", err)
	}

	if _, err := GetProvider(repositories.ImplicitCell().ID(), updated); err != nil {
		t.Fatalf("rebuild failed: %v", err)
	}

	if count := idp.discoveryCount(); count != 2 {
		t.Errorf("expected an edit to force rediscovery, got %d fetches", count)
	}
}

func TestGetProviderRebuildsWhenTheIssuerChanges(t *testing.T) {
	defer teardownOidcTest()
	idp, provider := setupOidcTest(t, oidcTestOptions{})

	if _, err := GetProvider(repositories.ImplicitCell().ID(), provider); err != nil {
		t.Fatalf("first discovery failed: %v", err)
	}

	other := newFakeIdp(t, provider.ClientId)
	provider.IssuerUrl = other.issuer()

	if _, err := GetProvider(repositories.ImplicitCell().ID(), provider); err != nil {
		t.Fatalf("rebuild failed: %v", err)
	}

	if idp.discoveryCount() != 1 || other.discoveryCount() != 1 {
		t.Errorf("expected each issuer to be discovered once, got %d and %d", idp.discoveryCount(), other.discoveryCount())
	}
}

func TestInvalidateProviderForcesRediscovery(t *testing.T) {
	defer teardownOidcTest()
	idp, provider := setupOidcTest(t, oidcTestOptions{})

	if _, err := GetProvider(repositories.ImplicitCell().ID(), provider); err != nil {
		t.Fatalf("first discovery failed: %v", err)
	}

	InvalidateProvider(repositories.ImplicitCell().ID(), provider.ID)

	if _, err := GetProvider(repositories.ImplicitCell().ID(), provider); err != nil {
		t.Fatalf("second discovery failed: %v", err)
	}

	if count := idp.discoveryCount(); count != 2 {
		t.Errorf("expected eviction to force rediscovery, got %d fetches", count)
	}
}

func TestGetProviderIsSafeUnderConcurrency(t *testing.T) {
	defer teardownOidcTest()
	_, provider := setupOidcTest(t, oidcTestOptions{})

	// Discovery deliberately runs outside the write lock, so a cold-start race can
	// discover twice. That is fine (NewProvider is idempotent) as long as it is not
	// a data race -- which is what -race in CI is checking here.
	var waitGroup sync.WaitGroup
	errs := make(chan error, 50)

	for i := 0; i < 50; i++ {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()

			if _, err := GetProvider(repositories.ImplicitCell().ID(), provider); err != nil {
				errs <- err
			}
		}()
	}

	waitGroup.Wait()
	close(errs)

	for err := range errs {
		t.Fatalf("concurrent discovery failed: %v", err)
	}
}

// Two cells hold the same provider id; an identical row (same id, issuer and UpdatedAt) in each is the case where a
// cache keyed by the bare id would serve cell A's discovered provider, and its cached signing keys, to cell B. Each
// cell must discover for itself, so the discovery document is fetched once per cell.
func TestGetProviderCacheKeepsCellsApart(t *testing.T) {
	defer teardownOidcTest()
	idp, provider := setupOidcTest(t, oidcTestOptions{})

	for _, cellID := range []cell.ID{celltest.IDA, celltest.IDB, celltest.IDA, celltest.IDB} {
		if _, err := GetProvider(cellID, provider); err != nil {
			t.Fatalf("discovery in cell %s failed: %v", cellID, err)
		}
	}
	if count := idp.discoveryCount(); count != 2 {
		t.Errorf("expected one discovery per cell (2), got %d: the cache served one cell's provider to the other", count)
	}

	// Invalidating the provider in A rebuilds A's entry only.
	InvalidateProvider(celltest.IDA, provider.ID)
	if _, err := GetProvider(celltest.IDB, provider); err != nil {
		t.Fatal(err)
	}
	if count := idp.discoveryCount(); count != 2 {
		t.Errorf("an invalidation in cell A forced cell B to discover again (%d fetches)", count)
	}
	if _, err := GetProvider(celltest.IDA, provider); err != nil {
		t.Fatal(err)
	}
	if count := idp.discoveryCount(); count != 3 {
		t.Errorf("cell A should have rediscovered after its invalidation, fetches = %d", count)
	}
}
