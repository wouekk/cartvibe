package cell

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"
)

var (
	// ErrUnknownCell is returned for a cell this manager does not hold.
	ErrUnknownCell = errors.New("cell: unknown cell")
	// ErrNoImplicitCell is returned by Implicit when the manager has no single default cell.
	ErrNoImplicitCell = errors.New("cell: no implicit cell")
)

// Manager hands out cell handles. Standalone mode uses NewStandaloneManager; the hosted worker will
// bring its own implementation (an LRU of open cells behind a catalog) behind the same interface.
type Manager interface {
	// Open returns the handle of one cell, or ErrUnknownCell.
	Open(ctx context.Context, id ID) (Handle, error)
	// Implicit returns the process's single default cell. It exists only in standalone mode, where
	// there is nothing to route; a multi-cell manager returns ErrNoImplicitCell.
	Implicit() (Handle, error)
}

// standaloneManager holds today's single database.
type standaloneManager struct {
	handle Handle
}

// NewStandaloneManager wraps the one database a standalone process opens at boot. Open accepts only
// StandaloneID, so a stray cell id fails instead of reading the single database.
func NewStandaloneManager(db *gorm.DB) (Manager, error) {
	if db == nil {
		return nil, errors.New("cell: standalone manager needs a database")
	}

	return standaloneManager{handle: Handle{id: StandaloneID, db: db}}, nil
}

func (m standaloneManager) Open(_ context.Context, id ID) (Handle, error) {
	if id != StandaloneID {
		return Handle{}, fmt.Errorf("%w: %q", ErrUnknownCell, id)
	}

	return m.handle, nil
}

func (m standaloneManager) Implicit() (Handle, error) {
	return m.handle, nil
}

// staticManager holds a fixed set of already-open cells.
type staticManager struct {
	handles map[ID]Handle
}

// NewStaticManager serves a fixed set of already-open cells and has no implicit one. Tests use it to
// run several cells in one process (see cell/celltest); it is also the smallest model of what the
// worker's manager has to guarantee: a handle only ever reaches its own cell's database.
func NewStaticManager(dbs map[ID]*gorm.DB) (Manager, error) {
	handles := make(map[ID]Handle, len(dbs))
	for id, db := range dbs {
		if id == "" || db == nil {
			return nil, errors.New("cell: static manager needs a non-empty id and a database for every cell")
		}
		handles[id] = Handle{id: id, db: db}
	}

	return staticManager{handles: handles}, nil
}

func (m staticManager) Open(_ context.Context, id ID) (Handle, error) {
	handle, ok := m.handles[id]
	if !ok {
		return Handle{}, fmt.Errorf("%w: %q", ErrUnknownCell, id)
	}

	return handle, nil
}

func (m staticManager) Implicit() (Handle, error) {
	return Handle{}, ErrNoImplicitCell
}
