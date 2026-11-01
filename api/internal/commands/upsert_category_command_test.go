package commands

import (
	"encoding/json"
	"testing"
)

func TestUpsertCategoryCommand_UnmarshalJSON(t *testing.T) {
	idOf := func(category UpsertCategoryCommand) uint {
		if category.Id == nil {
			return 0
		}
		return *category.Id
	}

	t.Run("an object is read as before", func(t *testing.T) {
		var category UpsertCategoryCommand
		if err := json.Unmarshal([]byte(`{"id":3,"name":"Drinks","description":"d","skipped":true}`), &category); err != nil {
			t.Fatal(err)
		}
		if idOf(category) != 3 || category.Name != "Drinks" || category.Description != "d" || !category.Skipped {
			t.Errorf("category = %+v", category)
		}
	})

	t.Run("an object without an id has no id", func(t *testing.T) {
		var category UpsertCategoryCommand
		if err := json.Unmarshal([]byte(`{"name":"New"}`), &category); err != nil {
			t.Fatal(err)
		}
		if category.Id != nil || category.Name != "New" {
			t.Errorf("category = %+v", category)
		}
	})

	t.Run("a bare number is the id", func(t *testing.T) {
		var receipt struct {
			Categories []UpsertCategoryCommand `json:"categories"`
		}
		if err := json.Unmarshal([]byte(`{"categories":[4,{"id":2}]}`), &receipt); err != nil {
			t.Fatal(err)
		}
		if len(receipt.Categories) != 2 || idOf(receipt.Categories[0]) != 4 || idOf(receipt.Categories[1]) != 2 {
			t.Errorf("categories = %+v", receipt.Categories)
		}
	})

	t.Run("null changes nothing", func(t *testing.T) {
		category := UpsertCategoryCommand{Name: "kept"}
		if err := json.Unmarshal([]byte(`null`), &category); err != nil || category.Name != "kept" || category.Id != nil {
			t.Errorf("category = %+v, err = %v", category, err)
		}
	})

	t.Run("something else is still an error", func(t *testing.T) {
		var category UpsertCategoryCommand
		for _, body := range []string{`"Drinks"`, `-1`, `[1]`, `true`} {
			if err := json.Unmarshal([]byte(body), &category); err == nil {
				t.Errorf("%s was accepted: %+v", body, category)
			}
		}
	})
}
