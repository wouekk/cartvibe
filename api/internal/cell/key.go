package cell

// CellKey is the key of anything a process holds in memory for a cell's rows: a cache entry, a subscriber list,
// a backoff. Two cells in one process hold the same ids, so a bare id (a role id, a group id, a provider id) is
// not a key; the pair (cell, id) is. Comparable, so it works as a map key.
type CellKey[T comparable] struct {
	Cell ID
	ID   T
}

// KeyOf builds the key for id in the cell the handle belongs to.
func KeyOf[T comparable](h Handle, id T) CellKey[T] {
	return CellKey[T]{Cell: h.ID(), ID: id}
}

// KeyIn builds the key for id in the cell with the given id, for code that holds only the cell id.
func KeyIn[T comparable](cellID ID, id T) CellKey[T] {
	return CellKey[T]{Cell: cellID, ID: id}
}
