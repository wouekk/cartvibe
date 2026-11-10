package repositories

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"gorm.io/gorm"
)

// Every start runs AutoMigrate over the database it finds, which on a NAS is one made by an earlier release.
// testdata/schema-v<release>.sql is the database a fresh install of that release had (tables and indexes, one
// statement per line). This test builds it, migrates it with today's code, and asks for everything a fresh install
// of today has: a table, a column of the right type, an index. What an old database has on top is fine (migrations
// only add) and is listed.
//
// A new fixture, after a release: check the tag out, dump `sqlite_master` of its migrated test database (tables
// first, then indexes), and add the file here. Fixtures are never edited.

type columnShape struct {
	Type    string
	NotNull bool
	Pk      bool
}

type databaseShape struct {
	tables  map[string]map[string]columnShape
	indexes map[string]string
}

func shapeOf(t *testing.T, database *gorm.DB) databaseShape {
	t.Helper()
	shape := databaseShape{tables: map[string]map[string]columnShape{}, indexes: map[string]string{}}

	var tables []string
	if err := database.Raw("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").Scan(&tables).Error; err != nil {
		t.Fatal(err)
	}
	for _, table := range tables {
		var columns []struct {
			Name    string
			Type    string
			Notnull bool
			Pk      int
		}
		if err := database.Raw(fmt.Sprintf(`PRAGMA table_info("%s")`, table)).Scan(&columns).Error; err != nil {
			t.Fatal(err)
		}
		shape.tables[table] = map[string]columnShape{}
		for _, column := range columns {
			shape.tables[table][column.Name] = columnShape{Type: strings.ToUpper(column.Type), NotNull: column.Notnull, Pk: column.Pk > 0}
		}

		var indexes []struct {
			Name   string
			Unique bool
			Origin string
		}
		if err := database.Raw(fmt.Sprintf(`PRAGMA index_list("%s")`, table)).Scan(&indexes).Error; err != nil {
			t.Fatal(err)
		}
		for _, index := range indexes {
			// "c" is an index someone created; the rest back a PRIMARY KEY or UNIQUE and are part of the table.
			if index.Origin != "c" {
				continue
			}
			var parts []struct{ Name string }
			if err := database.Raw(fmt.Sprintf(`PRAGMA index_info("%s")`, index.Name)).Scan(&parts).Error; err != nil {
				t.Fatal(err)
			}
			names := make([]string, len(parts))
			for i, part := range parts {
				names[i] = part.Name
			}
			shape.indexes[index.Name] = fmt.Sprintf("%s(%s) unique=%v", table, strings.Join(names, ","), index.Unique)
		}
	}

	return shape
}

func openScratchDatabase(t *testing.T, name string) *gorm.DB {
	t.Helper()
	database, err := openSplitDatabase(filepath.Join(t.TempDir(), name), sqliteParams(true), &gorm.Config{Logger: quietGormLogger()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { closePools(database) })
	return database
}

func TestAReleaseDatabaseMigratesToTodaysSchema(t *testing.T) {
	fixtures, err := filepath.Glob(filepath.Join("testdata", "schema-v*.sql"))
	if err != nil || len(fixtures) == 0 {
		t.Fatalf("no release fixture in testdata (%v)", err)
	}

	fresh := openScratchDatabase(t, "fresh.db")
	if err := migrateSchema(fresh); err != nil {
		t.Fatal(err)
	}
	want := shapeOf(t, fresh)

	for _, fixture := range fixtures {
		t.Run(strings.TrimSuffix(filepath.Base(fixture), ".sql"), func(t *testing.T) {
			statements, err := os.ReadFile(fixture)
			if err != nil {
				t.Fatal(err)
			}
			upgraded := openScratchDatabase(t, "release.db")
			for _, statement := range strings.Split(strings.ReplaceAll(string(statements), "\r\n", "\n"), "\n") {
				if strings.TrimSpace(statement) == "" {
					continue
				}
				if err := upgraded.Exec(statement).Error; err != nil {
					t.Fatalf("the fixture does not load: %v\n%s", err, statement)
				}
			}

			if err := migrateSchema(upgraded); err != nil {
				t.Fatalf("today's migration fails on this release's database: %v", err)
			}

			// The one-time data changes run on what the migration left, as at a start (they use the process database).
			process := db
			db = upgraded
			err = RunDataMigrations()
			db = process
			if err != nil {
				t.Fatalf("the data migrations fail on this release's database: %v", err)
			}

			got := shapeOf(t, upgraded)
			var missing, extra []string
			for table, columns := range want.tables {
				if _, ok := got.tables[table]; !ok {
					missing = append(missing, "table "+table)
					continue
				}
				for column, shape := range columns {
					have, ok := got.tables[table][column]
					if !ok {
						missing = append(missing, fmt.Sprintf("column %s.%s", table, column))
					} else if have != shape {
						missing = append(missing, fmt.Sprintf("column %s.%s is %+v, a fresh install has %+v", table, column, have, shape))
					}
				}
			}
			for index, shape := range want.indexes {
				if got.indexes[index] != shape {
					missing = append(missing, fmt.Sprintf("index %s is %q, a fresh install has %q", index, got.indexes[index], shape))
				}
			}
			for table, columns := range got.tables {
				if _, ok := want.tables[table]; !ok {
					extra = append(extra, "table "+table)
					continue
				}
				for column := range columns {
					if _, ok := want.tables[table][column]; !ok {
						extra = append(extra, fmt.Sprintf("column %s.%s", table, column))
					}
				}
			}
			sort.Strings(missing)
			sort.Strings(extra)

			if len(missing) > 0 {
				t.Errorf("after migrating, this release's database lacks what a fresh install has:\n  %s", strings.Join(missing, "\n  "))
			}
			if len(extra) > 0 {
				t.Logf("kept from the release (migrations only add):\n  %s", strings.Join(extra, "\n  "))
			}
		})
	}
}
