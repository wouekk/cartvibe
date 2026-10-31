package cell

import "gorm.io/gorm"

// ID names a cell (one household's database). Standalone has exactly one, StandaloneID.
type ID string

// StandaloneID is the identifier of the one implicit cell in standalone mode.
const StandaloneID ID = "standalone"

// Handle is the only way repositories reach a cell's database. Its fields are unexported, so code
// outside this package cannot build one: a Manager hands them out. The zero Handle belongs to no cell
// and carries no database.
type Handle struct {
	id ID
	db *gorm.DB
}

// ID returns the cell this handle belongs to ("" for the zero Handle).
func (h Handle) ID() ID {
	return h.id
}

// IsZero reports whether the handle belongs to no cell.
func (h Handle) IsZero() bool {
	return h.db == nil
}

// DB returns the cell's connection pool, nil for the zero Handle. Use it for queries only; never store
// it in a package-level variable or a context (the lint in tools/celllint reports the former).
func (h Handle) DB() *gorm.DB {
	return h.db
}
