// Package celllint is a go/analysis pass that finds the ways code reaches a database without a cell
// handle: a package-level *gorm.DB, gorm.Open outside internal/cell, and calls of the process-wide
// repositories.GetDB(). It reports; whether a finding fails the build is the caller's decision
// (api/scripts/cell-lint.sh is report-only for now). Design: api/docs/cell-runtime.md.
package celllint

import (
	"fmt"
	"go/ast"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
)

const (
	gormPath         = "gorm.io/gorm"
	repositoriesPath = "cartvibe/api/internal/repositories"
	cellPath         = "cartvibe/api/internal/cell"
)

// Finding categories, also the prefix of every message so a script can count them.
const (
	CategoryGlobalDB = "global-db"
	CategoryGormOpen = "gorm-open"
	CategoryGetDB    = "get-db"
)

var Analyzer = &analysis.Analyzer{
	Name: "celllint",
	Doc: `report database access that bypasses the cell handle

Flags (1) a package-level variable that holds a gorm.DB, (2) any use of gorm.Open outside the
cell package, (3) any use of the package-level function repositories.GetDB. The BaseRepository and
BaseService GetDB methods are not flagged: they return the database a repository was built with.`,
	Run: run,
}

func run(pass *analysis.Pass) (any, error) {
	exempt := inCellPackage(pass.Pkg.Path())

	if !exempt {
		scope := pass.Pkg.Scope()
		for _, name := range scope.Names() {
			variable, ok := scope.Lookup(name).(*types.Var)
			if !ok {
				continue
			}
			if path, found := findGormDB(variable.Type(), map[types.Type]bool{}); found {
				pass.Report(analysis.Diagnostic{
					Pos:      variable.Pos(),
					Category: CategoryGlobalDB,
					Message:  fmt.Sprintf("[%s] package-level variable %s holds a gorm.DB (%s); take a cell.Handle instead", CategoryGlobalDB, name, path),
				})
			}
		}
	}

	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			ident, ok := node.(*ast.Ident)
			if !ok {
				return true
			}
			fn, ok := pass.TypesInfo.Uses[ident].(*types.Func)
			if !ok || fn.Pkg() == nil {
				return true
			}
			if signature, ok := fn.Type().(*types.Signature); !ok || signature.Recv() != nil {
				return true
			}

			switch {
			case fn.Pkg().Path() == gormPath && fn.Name() == "Open" && !exempt:
				pass.Report(analysis.Diagnostic{
					Pos:      ident.Pos(),
					Category: CategoryGormOpen,
					Message:  fmt.Sprintf("[%s] gorm.Open outside internal/cell; only the cell package opens databases", CategoryGormOpen),
				})
			case fn.Pkg().Path() == repositoriesPath && fn.Name() == "GetDB":
				pass.Report(analysis.Diagnostic{
					Pos:      ident.Pos(),
					Category: CategoryGetDB,
					Message:  fmt.Sprintf("[%s] repositories.GetDB() reaches the process-wide database; take a cell.Handle instead", CategoryGetDB),
				})
			}
			return true
		})
	}

	return nil, nil
}

// inCellPackage is true for internal/cell and everything below it (the twin-cell fixture opens real
// databases there). An external test package ("..._test") counts as its package.
func inCellPackage(path string) bool {
	path = strings.TrimSuffix(path, "_test")
	return path == cellPath || strings.HasPrefix(path, cellPath+"/")
}

// findGormDB walks a type and says where it holds a gorm.DB (by value or pointer, through containers,
// struct fields and named types). The returned text is a short route such as "[]*gorm.DB".
func findGormDB(t types.Type, seen map[types.Type]bool) (string, bool) {
	if seen[t] {
		return "", false
	}
	seen[t] = true

	switch typed := t.(type) {
	case *types.Named:
		if obj := typed.Obj(); obj.Pkg() != nil && obj.Pkg().Path() == gormPath && obj.Name() == "DB" {
			return "gorm.DB", true
		}
		if path, ok := findGormDB(typed.Underlying(), seen); ok {
			return typed.Obj().Name() + " -> " + path, true
		}
	case *types.Pointer:
		if path, ok := findGormDB(typed.Elem(), seen); ok {
			return "*" + path, true
		}
	case *types.Slice:
		if path, ok := findGormDB(typed.Elem(), seen); ok {
			return "[]" + path, true
		}
	case *types.Array:
		if path, ok := findGormDB(typed.Elem(), seen); ok {
			return "[...]" + path, true
		}
	case *types.Chan:
		if path, ok := findGormDB(typed.Elem(), seen); ok {
			return "chan " + path, true
		}
	case *types.Map:
		if path, ok := findGormDB(typed.Elem(), seen); ok {
			return "map -> " + path, true
		}
	case *types.Struct:
		for i := 0; i < typed.NumFields(); i++ {
			if path, ok := findGormDB(typed.Field(i).Type(), seen); ok {
				return "field " + typed.Field(i).Name() + " " + path, true
			}
		}
	}

	return "", false
}
