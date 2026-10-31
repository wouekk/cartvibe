package services

import (
	"cartvibe/api/internal/cell"
	"cartvibe/api/internal/repositories"
)

// implicitCellID is the cell of the call chains that do not carry a handle yet: the services are built from
// repositories.ImplicitCell(). It keys the in-memory caches (role permissions, grants, SSE streams, outage
// backoff), so the keys are already (cell, id) when a service learns its cell. Transitional, like ImplicitCell.
func implicitCellID() cell.ID {
	return repositories.ImplicitCell().ID()
}

// ImplicitCellID is implicitCellID for the packages above services that publish to or evict from its caches.
func ImplicitCellID() cell.ID {
	return implicitCellID()
}
