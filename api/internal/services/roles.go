package services

import (
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"

	"gorm.io/gorm"
)

// RoleService reads the roles. They are fixed (2026-11): Admin and User in the
// app, Owner and Member in a household, seeded from code by
// repositories.SeedSystemRoles. Nothing creates, changes or deletes a role at
// run time, so there is nothing here but the list the people pages pick from.
type RoleService struct {
	BaseService
}

func NewRoleService(tx *gorm.DB) RoleService {
	service := RoleService{BaseService: BaseService{
		DB: repositories.GetDB(),
		TX: tx,
	}}
	return service
}

func (service RoleService) GetRoles() ([]structs.RoleView, error) {
	roleRepository := repositories.NewRoleRepository(service.TX)
	return roleRepository.GetAllRoles()
}
