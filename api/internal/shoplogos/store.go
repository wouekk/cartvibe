package shoplogos

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"cartvibe/api/internal/utils"
)

// Folder is where the logos live inside the data directory, beside the groups' folders (whose names start with a
// number) and shopping-trips. It survives redeploys with the data volume.
const Folder = "shop-logos"

const indexFile = "index.json"

// ErrUnknownBrand is returned for a slug that is not in brands.json, so a request can never name another file.
var ErrUnknownBrand = errors.New("unknown brand")

// entry is what the store remembers about one brand between syncs.
type entry struct {
	// ETag is Logo.dev's version of the stored logo; a logo is downloaded again only when it changes.
	ETag string `json:"etag,omitempty"`
	// CheckedAt is when Logo.dev was last asked about the brand.
	CheckedAt time.Time `json:"checkedAt"`
	// Missing means Logo.dev has no logo for the brand; it is asked again after the refresh interval.
	Missing bool `json:"missing,omitempty"`
}

// Store reads and writes the logo files and their index.
type Store struct {
	mu  sync.Mutex
	dir string
}

// NewStore opens the store in the data directory's shop-logos folder.
func NewStore() (*Store, error) {
	dataDir, err := utils.GetDataDir()
	if err != nil {
		return nil, err
	}
	return &Store{dir: filepath.Join(dataDir, Folder)}, nil
}

func (store *Store) logoPath(slug string) (string, error) {
	if _, found := BrandBySlug(slug); !found {
		return "", ErrUnknownBrand
	}
	path := filepath.Join(store.dir, slug+".png")
	if err := utils.AssertWithinDataDir(path); err != nil {
		return "", err
	}
	return path, nil
}

// HasLogo reports whether a logo file is stored for the brand.
func (store *Store) HasLogo(slug string) bool {
	path, err := store.logoPath(slug)
	if err != nil {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && !info.IsDir() && info.Size() > 0
}

// ReadLogo returns a stored logo's PNG bytes.
func (store *Store) ReadLogo(slug string) ([]byte, error) {
	path, err := store.logoPath(slug)
	if err != nil {
		return nil, err
	}
	return utils.ReadDataFile(path)
}

// writeLogo stores a logo through a temporary file and a rename, so a request never reads half a file.
func (store *Store) writeLogo(slug string, data []byte) error {
	path, err := store.logoPath(slug)
	if err != nil {
		return err
	}
	if err := utils.EnsureDataDirectory(store.dir); err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := utils.WriteDataFile(temporary, data); err != nil {
		return err
	}
	return utils.RenameDataPath(temporary, path)
}

// Available lists the brands that have a stored logo, in the order of brands.json; never nil.
func (store *Store) Available() []Brand {
	available := []Brand{}
	for _, brand := range Brands() {
		if store.HasLogo(brand.Slug) {
			available = append(available, brand)
		}
	}
	return available
}

func (store *Store) readIndex() map[string]entry {
	store.mu.Lock()
	defer store.mu.Unlock()

	index := map[string]entry{}
	data, err := utils.ReadDataFile(filepath.Join(store.dir, indexFile))
	if err != nil {
		return index
	}
	if err := json.Unmarshal(data, &index); err != nil {
		return map[string]entry{}
	}
	return index
}

func (store *Store) writeIndex(index map[string]entry) error {
	store.mu.Lock()
	defer store.mu.Unlock()

	data, err := json.Marshal(index)
	if err != nil {
		return err
	}
	if err := utils.EnsureDataDirectory(store.dir); err != nil {
		return err
	}
	return utils.WriteDataFile(filepath.Join(store.dir, indexFile), data)
}
